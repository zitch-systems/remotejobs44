// app/api/admin/ai-discovery/settings/route.ts
// Persists AI provider API keys/models entered in the admin dashboard.
// Admin-only. Keys are stored in the public.ai_provider_configs table,
// guarded by both RLS (admin-only) and an explicit admin check here.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { encryptSecret, decryptSecret } from '@/lib/crypto/secret';
import { logError } from '@/lib/log';

const SUPPORTED_PROVIDERS = new Set([
  'claude', 'openai', 'gemini', 'groq', 'kimi', 'mistral', 'cohere', 'together',
]);

// Mask an API key for the wire — return last-4 + length so the admin UI can
// show "saved" state and let the admin overwrite without ever sending the
// plaintext key back to the browser. Reduces exposure to browser memory,
// extensions, network captures, and accidental log lines.
function maskApiKey(key: string | null): { has_key: boolean; api_key_masked: string | null } {
  if (!key) return { has_key: false, api_key_masked: null };
  const tail = key.length > 4 ? key.slice(-4) : key;
  return { has_key: true, api_key_masked: `••••${tail}` };
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
      if (/relation .* does not exist/i.test(error.message)) {
        return NextResponse.json({ configs: [], hint: 'Run supabase/setup.sql to create ai_provider_configs.' });
      }
      throw new Error(error.message);
    }

    // Never return plaintext api_key over the wire. Decrypt the stored
    // value just long enough to compute the last-4 mask, then drop it.
    // Legacy plaintext rows decrypt as themselves (decryptSecret is a
    // no-op when there's no `enc:v1:` prefix), so the same code path
    // handles both shapes during migration.
    const safe = (data ?? []).map((row: any) => {
      const { api_key, ...rest } = row;
      let plain: string | null = null;
      try {
        plain = decryptSecret(api_key);
      } catch (err: any) {
        // Encrypted row but no AI_KEYS_ENCRYPTION_KEY (or wrong key). Surface
        // a clear "missing key" tail rather than crashing the whole list.
        logError({ event: 'admin.ai_discovery_settings.decrypt_failed', provider_id: row.provider_id, error: err?.message ?? String(err) });
      }
      return { ...rest, ...maskApiKey(plain) };
    });
    return NextResponse.json({ configs: safe });
  } catch (err: any) {
    logError({ event: 'admin.ai_discovery_settings.get_failed', error: err?.message ?? String(err) });
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
  // Defense in depth: if the client sent the masked placeholder back, treat
  // it as "no change" rather than overwriting the stored real key with the
  // mask. Client persistConfig() strips it too — this is the belt.
  const apiKeyClean = (typeof apiKey === 'string' && apiKey.startsWith('••••')) ? undefined : apiKey;
  if (model !== undefined && (typeof model !== 'string' || model.length > 100)) {
    return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const payload: Record<string, unknown> = { provider_id: providerId };
    // Encrypt at write-time. When AI_KEYS_ENCRYPTION_KEY is unset,
    // encryptSecret returns the plaintext (with a one-time warn) so the
    // feature still works during onboarding; once the env var lands, the
    // next save migrates the row to the v1 envelope automatically.
    if (apiKeyClean !== undefined) payload.api_key = encryptSecret(apiKeyClean);
    if (model       !== undefined) payload.model   = model;
    if (enabled     !== undefined) payload.enabled = enabled;

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

    // Audit metadata: which provider, what changed (key/model/enabled),
    // never the actual key value. apiKeyClean=undefined means the admin
    // sent the masked placeholder back (no change); we record that as
    // "no_key_change" so reviewers can distinguish a rotation from an
    // enable/disable.
    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'ai_provider.update', targetType: 'ai_provider', targetId: providerId,
      metadata: {
        key_changed: apiKeyClean !== undefined,
        model_changed: model !== undefined,
        enabled: enabled,
      },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logError({ event: 'admin.ai_discovery_settings.post_failed', error: err?.message ?? String(err) });
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
    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'ai_provider.delete', targetType: 'ai_provider', targetId: providerId,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logError({ event: 'admin.ai_discovery_settings.delete_failed', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Failed to delete settings' }, { status: 500 });
  }
}
