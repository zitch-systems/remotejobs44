// app/api/cv/route.ts — CV upload to Supabase Storage
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

    const ext      = file.name.split('.').pop();
    const filename = `${user.id}/cv.${ext}`;
    const buffer   = Buffer.from(await file.arrayBuffer());

    const { data, error } = await supabase.storage
      .from('cvs')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true, // overwrite existing CV
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from('cvs').getPublicUrl(filename);

    // Save URL to profile
    await supabase.from('profiles').update({
      cv_url: publicUrl,
      profile_completion: 80,
    }).eq('id', user.id);

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
