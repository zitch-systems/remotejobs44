// app/api/cv/route.ts — CV upload to Supabase Storage
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { detectMagicMime } from '@/lib/file-magic';
import { rateLimit } from '@/lib/rate-limit';
import { logError, logWarn } from '@/lib/log';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Pro-only gate. /pricing copy lists CV upload as a Pro feature
    // ("CV upload & auto-apply") but this route used to accept uploads
    // from any signed-in user including the free tier.
    const { data: profile } = await supabase
      .from('profiles').select('plan, role').eq('id', user.id).maybeSingle();
    const plan = profile?.plan ?? 'free';
    const allowed = profile?.role === 'admin' || plan === 'daily' || plan === 'pro' || plan === 'admin';
    if (!allowed) {
      return NextResponse.json(
        { error: 'CV upload is a Pro feature. Upgrade your plan to upload.' },
        { status: 403 },
      );
    }

    // Per-user rate limit. A paid user could otherwise loop 5 MB
    // uploads — each upload runs the magic-byte scan + the Supabase
    // storage round-trip + the profile update. Bucket is upsert-by-
    // path so storage doesn't grow, but bandwidth + lambda CPU do.
    // 10/hr is far more than any human re-uploads.
    const rl = rateLimit(`cv-upload:${user.id}`, 10, 60 * 60 * 1000);
    if (!rl.success) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      logWarn({ event: 'cv.upload.rate_limited', user_id: user.id });
      return NextResponse.json(
        { error: 'Too many uploads. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const form = await req.formData();
    const file = form.get('cv') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Validate file
    if (!['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) {
      return NextResponse.json({ error: 'Only PDF and Word documents are accepted' }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
    }

    // Whitelist the file extension instead of trusting whatever the client
    // sent in file.name. Pairs with the MIME-type check above so a client
    // can't upload a `.html` named-as-PDF and have Storage serve it as HTML.
    const ALLOWED_EXT: Record<string, string> = {
      'application/pdf':                                                                'pdf',
      'application/msword':                                                             'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':        'docx',
    };
    const ext      = ALLOWED_EXT[file.type] ?? 'pdf';
    const filename = `${user.id}/cv.${ext}`;
    const buffer   = Buffer.from(await file.arrayBuffer());

    // Magic-byte verification. Reject the upload if the actual file
    // bytes don't match the claimed MIME-type. Closes the path where a
    // user POSTs Content-Type: application/pdf with HTML/script bytes
    // inside — the signed URL would then serve that payload with
    // Content-Type: application/pdf in the response header.
    const actualMime = detectMagicMime(buffer);
    if (!actualMime || actualMime !== file.type) {
      return NextResponse.json(
        { error: 'File contents don’t match the file type. Please upload a real PDF or Word document.' },
        { status: 400 },
      );
    }

    const { error } = await supabase.storage
      .from('cvs')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true, // overwrite existing CV
      });

    if (error) throw error;

    // The `cvs` bucket is private (see supabase/setup.sql) — `getPublicUrl`
    // returns a URL that will 401 when fetched. Use a signed URL with a
    // 1-hour TTL instead; client re-requests when it expires. We store only
    // the storage path on the profile so future fetches can re-sign without
    // depending on the original URL's expiry.
    const SIGNED_TTL = 60 * 60; // 1 hour
    const { data: signed, error: signErr } = await supabase.storage
      .from('cvs').createSignedUrl(filename, SIGNED_TTL);
    if (signErr || !signed?.signedUrl) {
      logError({ event: 'cv.signed_url_failed', error: signErr?.message ?? 'unknown', user_id: user.id });
      return NextResponse.json({ error: 'Upload succeeded but signing the URL failed' }, { status: 500 });
    }
    const signedUrl = signed.signedUrl;

    // Save the *path* on the profile (so we can re-sign later) and return
    // the signed URL for the immediate client redirect.
    //
    // Use the service-role admin client for the write: migration_v9 revokes
    // UPDATE privileges on `cv_url` + `profile_completion` from the
    // `authenticated` role to block client-side privilege escalation. We
    // still scope by user.id (authoritatively validated via getUser above),
    // so this stays an own-row-only write.
    await createAdminSupabaseClient().from('profiles').update({
      cv_url: filename,
      profile_completion: 80,
    }).eq('id', user.id);

    return NextResponse.json({ success: true, url: signedUrl, path: filename });
  } catch (err: any) {
    // Don't leak Storage/Supabase SDK message text to the client —
    // those can include internal hostnames + handler names. Log for
    // ops and ship a generic shape.
    logError({ event: 'cv.upload.unhandled', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}

// GET — re-sign the calling user's stored CV path. The profile page hits
// this whenever it needs a fresh viewable URL (signed URLs expire after
// SIGNED_TTL above). Only the row's own user can fetch theirs.
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('cv_url').eq('id', user.id).maybeSingle();
    const cvPath = profile?.cv_url;
    if (!cvPath) return NextResponse.json({ url: null });

    // Backward-compat: if a legacy row stored a full public URL (pre-fix)
    // just hand it back as-is — the storage proxy will 401 it but the
    // user can re-upload to get a working path.
    if (typeof cvPath === 'string' && /^https?:\/\//.test(cvPath)) {
      return NextResponse.json({ url: cvPath, legacy: true });
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from('cvs').createSignedUrl(cvPath, 60 * 60);
    if (signErr || !signed?.signedUrl) {
      // Match POST: log the raw Storage error server-side, ship a generic
      // shape to the client. signErr.message can include the bucket path
      // + internal hostnames.
      logError({ event: 'cv.get.sign_failed', user_id: user.id, error: signErr?.message ?? 'unknown' });
      return NextResponse.json({ error: 'Could not load your CV.' }, { status: 500 });
    }
    return NextResponse.json({ url: signed.signedUrl });
  } catch (err: any) {
    logError({ event: 'cv.get.unhandled', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Could not load your CV.' }, { status: 500 });
  }
}
