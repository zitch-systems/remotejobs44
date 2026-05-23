// app/api/admin/ai-discovery/settings/route.ts
// Persists AI provider API keys/models entered in the admin dashboard.
// Admin-only. Keys are stored in the public.ai_provider_configs table,
// guarded by both RLS (admin-only) and an explicit admin check here.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { isHardcodedAdmin } from '@/lib/admin-emails';

const SUPPORTED_PROVIDERS = new Set([
  'claude', 'openai', 'gemini', 'groq', 'kimi', 'mistral', 'cohere', 'together',
]);

async function requireAdmin(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin' && !isHardcodedAdmin(user.email)) {
      return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { ok: true };
  } catch {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
}

// GET — return all saved provider configs (admin only)
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('ai_provider_configs')
      .select('provider_id, api_key, model, enabled, updated_at');

    if (error) {
      // If the table doesn't exist yet, return empty config rather than failing.
      if (/relation .* does not exist/i.test(error.message)) {
        return NextResponse.json({ configs: [], hint: 'Run supabase/setup.sql to create ai_provider_configs.' });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ configs: data ?? [] });
  } catch (err: any) {
    console.error('[ai-discovery/settings GET]', err);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

// POST — upsert a single provider's config
//   body: { providerId: string, apiKey?: string, model?: string, enabled?: boolean }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  let body: { providerId?: string; apiKey?: string; model?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { providerId, apiKey, model, enabled } = body;
  if (!providerId || !SUPPORTED_PROVIDERS.has(providerId)) {
    return NextResponse.json({ error: 'Unknown providerId' }, { status: 400 });
  }
  if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length > 500)) {
    return NextResponse.json({ error: 'Invalid apiKey' }, { status: 400 });
  }
  if (model !== undefined && (typeof model !== 'string' || model.length > 100)) {
    return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const payload: Record<string, unknown> = { provider_id: providerId };
    if (apiKey  !== undefined) payload.api_key = apiKey;
    if (model   !== undefined) payload.model   = model;
    if (enabled !== undefined) payload.enabled = enabled;

    const { error } = await supabase
      .from('ai_provider_configs')
      .upsert(payload, { onConflict: 'provider_id' });

    if (error) {
      if (/relation .* does not exist/i.test(error.message)) {
        return NextResponse.json(
          { error: 'ai_provider_configs table missing. Run supabase/setup.sql in your Supabase dashboard.' },
          { status: 500 }
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[ai-discovery/settings POST]', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

// DELETE — wipe a provider's saved config (sets api_key=null, enabled=false)
//   body: { providerId: string }
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  let body: { providerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { providerId } = body;
  if (!providerId || !SUPPORTED_PROVIDERS.has(providerId)) {
    return NextResponse.json({ error: 'Unknown providerId' }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from('ai_provider_configs')
      .delete()
      .eq('provider_id', providerId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[ai-discovery/settings DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete settings' }, { status: 500 });
  }
}
