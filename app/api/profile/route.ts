// app/api/profile/route.ts — Get and upsert the current user's profile
// Called on login to ensure the profile row always exists.
// Also acts as the backstop for the welcome email: the "auto-confirm signups"
// setting bypasses /auth/callback entirely, and a callback that dies mid-
// background-task leaves the email unsent. sendWelcomeEmailOnce is idempotent
// (see lib/email/welcome.ts), so calling it here costs one no-op UPDATE for
// users who already have theirs.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { sendWelcomeEmailOnce } from '@/lib/email/welcome';
import { resolvePlan } from '@/lib/auth/plan';
import { computeProfileCompletion } from '@/lib/auth/profile-completion';
import { logError } from '@/lib/log';
import { waitUntil } from '@vercel/functions';

// Columns safe to expose to the owning user. Paystack identifiers
// (customer_code, subscription_code, email_token) are intentionally EXCLUDED
// from the response — the client never needs them, and they're best kept
// off-wire to limit exposure via logs, extensions, and crash reports.
const SAFE_PROFILE_COLS = 'id, email, name, plan, role, created_at, updated_at, profile_completion, plan_expires_at, suspended, suspended_reason, cv_url, target_role, cv_text';

// GET /api/profile — Fetch current user's profile (creates if missing)
//
// The expire-pass cron runs once daily at 6 UTC (Vercel Hobby quota), so a
// Day Pass purchased at 7am UTC would otherwise show as 'daily' until ~6
// UTC the next day. We surface the *effective* plan computed from
// plan_expires_at via resolvePlan() so the UI doesn't lie during that
// ~23h window. /api/applications still gates correctly off
// subscriptions.current_period_end, so applies are already blocked.
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();

    const { data: profile, error } = await admin
      .from('profiles')
      .select(SAFE_PROFILE_COLS)
      .eq('id', user.id)
      .maybeSingle();

    // CRITICAL: if SELECT errored (network blip, transient Supabase issue),
    // `profile` is null but the row may actually exist with plan='daily' /
    // 'pro'. Without this guard we'd fall through to the upsert path
    // which writes plan='free' onConflict — clobbering a paying user.
    // Return 500 so the client can retry rather than mis-creating state.
    if (error) {
      logError({ event: 'profile.select_failed', user_id: user.id, error: error.message });
      return NextResponse.json({ error: 'Failed to read profile' }, { status: 500 });
    }

    if (profile) {
      const role = (profile.role !== 'admin' && isHardcodedAdmin(user.email)) ? 'admin' : (profile.role ?? 'user');
      const plan = resolvePlan({
        role,
        dbPlan: profile.plan,
        planExpiresAt: profile.plan_expires_at,
      });
      // Profile completion %: recompute against the current signals
      // (name, email_confirmed_at, cv_url, application count, saved
      // count) so the ring on /profile and /dashboard reflects reality
      // instead of the hardcoded 20/80 the column used to be stuck on.
      // Counts use head:true so we don't pay row payload to count.
      const [{ count: applicationsCount }, { count: savedJobsCount }] = await Promise.all([
        admin.from('applications').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        admin.from('saved_jobs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      const computed = computeProfileCompletion({
        name:              profile.name,
        email:             profile.email,
        emailConfirmedAt:  user.email_confirmed_at,
        cvUrl:             profile.cv_url,
        targetRole:        profile.target_role,
        cvText:            profile.cv_text,
        applicationsCount: applicationsCount ?? 0,
        savedJobsCount:    savedJobsCount ?? 0,
      });
      // Write-back when it drifted from the stored value. waitUntil
      // keeps the lambda alive past the JSON response so Vercel
      // doesn't kill the request before the UPDATE lands — without
      // it the write-back was effectively never persisted on cold
      // serverless invocations.
      if (computed !== (profile.profile_completion ?? 0)) {
        // Promise.resolve() unwraps Supabase's PostgrestBuilder (a
        // PromiseLike, not a real Promise) into the Promise<T> shape
        // waitUntil expects.
        waitUntil(Promise.resolve(
          admin.from('profiles')
            .update({ profile_completion: computed, updated_at: new Date().toISOString() })
            .eq('id', user.id)
            .then(({ error: writeErr }) => {
              if (writeErr) logError({ event: 'profile.completion_writeback_failed', user_id: user.id, error: writeErr.message });
            })
        ));
      }
      // Catch-up welcome email. This used to live only on the "profile row
      // missing" branch below, which the on_auth_user_created trigger has
      // made unreachable since migration_v3 — the row always exists by the
      // time we get here, so the fallback never fired. Moving it onto the
      // normal read path makes /api/profile a real backstop for
      // /auth/callback: any authenticated user who somehow never got their
      // welcome email picks it up on their next dashboard load.
      // sendWelcomeEmailOnce claims profiles.welcome_email_sent_at
      // atomically, so this is a no-op (one indexed UPDATE that matches
      // nothing) for everyone who already has one.
      waitUntil(
        sendWelcomeEmailOnce(admin, {
          userId: user.id,
          email:  profile.email ?? user.email ?? '',
          name:   profile.name,
        }).catch(err =>
          logError({ event: 'profile.welcome_email_failed', user_id: user.id, error: err?.message ?? String(err) })
        )
      );

      return NextResponse.json({
        profile: { ...profile, plan, role, profile_completion: computed },
      });
    }

    // Profile missing — create it now (handles users who signed up before trigger was added)
    const name = user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'User';
    const isAdmin = isHardcodedAdmin(user.email);

    const { data: newProfile, error: insertError } = await admin
      .from('profiles')
      .upsert({
        id:                 user.id,
        name:               name,
        email:              user.email,
        plan:               isAdmin ? 'admin' : 'free',
        role:               isAdmin ? 'admin' : 'user',
        // profile_completion intentionally omitted — DEFAULT 0
        // (migration_v24). The recompute on the next read fills in
        // the honest value (typically 20 for a freshly-confirmed
        // signup who has nothing else set).
      }, { onConflict: 'id' })
      // Re-select via SAFE_PROFILE_COLS so the response shape matches the
      // happy path and we don't leak paystack_* columns.
      .select(SAFE_PROFILE_COLS)
      .single();

    // First profile creation — welcome email. Reached only by accounts that
    // predate the on_auth_user_created trigger (migration_v3); every current
    // signup is served by the catch-up call on the read path above. Kept so
    // the rare trigger-less user still gets onboarded.
    if (!insertError && user.email) {
      waitUntil(
        sendWelcomeEmailOnce(admin, { userId: user.id, email: user.email, name }).catch(err =>
          logError({ event: 'profile.welcome_email_failed', user_id: user.id, error: err?.message ?? String(err) })
        )
      );
    }

    if (insertError) {
      logError({ event: 'profile.insert_failed', user_id: user.id, error: insertError.message });
      // Return a safe fallback profile even if DB write fails. Compute
      // profile_completion from the signals we have access to here
      // (no DB available — apps/saved counts assumed 0) so the
      // dashboard renders an honest baseline instead of a stale 20.
      return NextResponse.json({
        profile: {
          id:   user.id,
          name: name,
          plan: isAdmin ? 'admin' : 'free',
          role: isAdmin ? 'admin' : 'user',
          profile_completion: computeProfileCompletion({
            name,
            email:             user.email,
            emailConfirmedAt:  user.email_confirmed_at,
            cvUrl:             null,
            targetRole:        null,
            cvText:            null,
            applicationsCount: 0,
            savedJobsCount:    0,
          }),
        }
      });
    }

    return NextResponse.json({ profile: newProfile });
  } catch (err: any) {
    logError({ event: 'profile.unhandled', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// PATCH /api/profile — update the owning user's editable profile fields
// (name, target_role, cv_text) and return the refreshed profile.
//
// Why a route instead of a client-side supabase.update(): migration_v9
// revokes UPDATE on profiles from the `authenticated` role for every column
// except (name, updated_at), and migration_v62 adds a trigger that rejects
// privileged-column edits from end-user sessions. target_role + cv_text are
// therefore only writable through the service-role admin client here. Routing
// name through the same handler keeps "Save changes" a single atomic write of
// everything the form edits (previously name saved fine but target role + CV
// text lived only in React state and were lost on reload).
//
// Scope is always .eq('id', user.id) with user.id from the authenticated
// getUser() call, so this stays an own-row-only write and never touches
// role / plan / plan_expires_at / suspended.
const MAX_NAME_LEN = 120;
const MAX_TARGET_ROLE_LEN = 100;
const MAX_CV_TEXT_LEN = 12000;

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    // name — required to be non-empty when present. Trim + length-cap mirror
    // the <input maxLength={120}> on /profile.
    if (body.name !== undefined) {
      if (typeof body.name !== 'string') {
        return NextResponse.json({ error: 'Name must be text' }, { status: 400 });
      }
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      updates.name = name.slice(0, MAX_NAME_LEN);
    }

    // target_role — optional free text; empty clears it back to NULL so the
    // completion signal drops honestly.
    if (body.target_role !== undefined) {
      if (body.target_role !== null && typeof body.target_role !== 'string') {
        return NextResponse.json({ error: 'Target role must be text' }, { status: 400 });
      }
      const role = String(body.target_role ?? '').trim().slice(0, MAX_TARGET_ROLE_LEN);
      updates.target_role = role.length > 0 ? role : null;
    }

    // cv_text — optional long free text; enforce the same 12k cap the AI CV
    // review route uses so a saved value always stays reviewable.
    if (body.cv_text !== undefined) {
      if (body.cv_text !== null && typeof body.cv_text !== 'string') {
        return NextResponse.json({ error: 'CV text must be text' }, { status: 400 });
      }
      const raw = String(body.cv_text ?? '');
      if (raw.length > MAX_CV_TEXT_LEN) {
        return NextResponse.json(
          { error: `CV text too long. Keep it under ${MAX_CV_TEXT_LEN.toLocaleString()} characters.` },
          { status: 400 },
        );
      }
      updates.cv_text = raw.trim().length > 0 ? raw : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No changes to save' }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    // Update and read the row back in ONE round trip. Chaining .select()
    // matches GET's shape (no paystack_* leak) AND lets us detect a 0-row
    // update: a missing profile row matches nothing and returns null, which
    // must surface as an error rather than a false "saved" — supabase-js
    // reports no error for an UPDATE that touches zero rows.
    const admin = createAdminSupabaseClient();
    const { data: profile, error: updateError } = await admin
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select(SAFE_PROFILE_COLS)
      .maybeSingle();
    if (updateError) {
      logError({ event: 'profile.update_failed', user_id: user.id, error: updateError.message });
      return NextResponse.json({ error: 'Failed to save changes' }, { status: 500 });
    }
    if (!profile) {
      // No row matched — the profile row doesn't exist yet (e.g. a prior GET
      // hit its insertError fallback without creating it). Nothing was
      // written, so don't claim success; a reload runs GET which upserts it.
      logError({ event: 'profile.update_no_row', user_id: user.id });
      return NextResponse.json(
        { error: 'We couldn’t find your profile to update. Please refresh and try again.' },
        { status: 404 },
      );
    }

    const role = (profile.role !== 'admin' && isHardcodedAdmin(user.email)) ? 'admin' : (profile.role ?? 'user');
    const plan = resolvePlan({
      role,
      dbPlan: profile.plan,
      planExpiresAt: profile.plan_expires_at,
    });
    const [{ count: applicationsCount }, { count: savedJobsCount }] = await Promise.all([
      admin.from('applications').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      admin.from('saved_jobs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);
    const computed = computeProfileCompletion({
      name:              profile.name,
      email:             profile.email,
      emailConfirmedAt:  user.email_confirmed_at,
      cvUrl:             profile.cv_url,
      targetRole:        profile.target_role,
      cvText:            profile.cv_text,
      applicationsCount: applicationsCount ?? 0,
      savedJobsCount:    savedJobsCount ?? 0,
    });
    if (computed !== (profile.profile_completion ?? 0)) {
      waitUntil(Promise.resolve(
        admin.from('profiles')
          .update({ profile_completion: computed })
          .eq('id', user.id)
          .then(({ error: writeErr }) => {
            if (writeErr) logError({ event: 'profile.completion_writeback_failed', user_id: user.id, error: writeErr.message });
          })
      ));
    }

    return NextResponse.json({
      profile: { ...profile, plan, role, profile_completion: computed },
    });
  } catch (err: any) {
    logError({ event: 'profile.patch_unhandled', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Failed to save changes' }, { status: 500 });
  }
}
