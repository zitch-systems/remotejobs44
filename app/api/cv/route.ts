// app/api/cv/route.ts — CV upload to Supabase Storage
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      console.error('[cv] createSignedUrl failed:', signErr?.message);
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — re-sign the calling user's stored CV path. The profile page hits
// this whenever it needs a fresh viewable URL (signed URLs expire after
// SIGNED_TTL above). Only the row's own user can fetch theirs.
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
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
      return NextResponse.json({ error: signErr?.message ?? 'Sign failed' }, { status: 500 });
    }
    return NextResponse.json({ url: signed.signedUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
