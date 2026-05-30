// app/api/admin/ai-discovery/route.ts
// Server-side proxy for AI provider calls — keeps API keys off the client and
// falls back to a server-stored key (ai_provider_configs table) when the
// client doesn't ship one. Admin-only.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { decryptSecret } from '@/lib/crypto/secret';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a remote job discovery assistant. Given a search query, return a JSON list of plausible currently-open remote job listings that would match the query.

IMPORTANT: You are generating listings from your knowledge of the job market. Be realistic — use real company names (Stripe, GitLab, Vercel, Cloudflare, HubSpot, Shopify, Zapier, Buffer, Automattic, Doist, Toptal, Linear, Notion, Hashicorp, Datadog, Snowflake, Databricks, Anthropic, OpenAI, etc.) and realistic role titles, salary ranges, and locations. Never invent fictional companies.

For each job, return:
- title:       exact role title (e.g. "Senior React Engineer", "Staff Product Designer")
- company:     real company name
- location:    "Remote" | "Remote - <Region>" | "<City>, <Country> (Remote)"
- type:        "full-time" | "part-time" | "contract" | "freelance"
- category:    one of: engineering, design, marketing, finance, sales, data, hr, product, legal, operations, other
- level:       "entry" | "mid" | "senior" | "lead" | "executive"
- description: 2-3 sentences describing the role and required skills
- applyUrl:    a careers/job-board URL on the company domain (https://...). If unsure of the exact URL, use the company's careers page (https://<company>.com/careers).
- salary:      optional salary range as a string (e.g. "$120,000 - $160,000/yr" or "Competitive")
- remote:      always true

CRITICAL RULES:
1. Only include REMOTE roles. Reject in-office and hybrid-only positions.
2. Return ONLY valid JSON in this exact shape: {"jobs":[ ... ]}
3. No markdown fences, no commentary, no explanation — just the JSON object.
4. Diversify companies and roles within each response (don't return 10 listings from one company).`;

type ProviderRequest = {
  providerId: string;
  apiKey?: string;
  model?: string;
  query: string;
  maxJobs?: number;
};

const PROVIDER_CONFIGS: Record<string, { defaultModel: string; baseUrl?: string }> = {
  claude:   { defaultModel: 'claude-sonnet-4-6' },
  openai:   { defaultModel: 'gpt-4o-mini',                          baseUrl: 'https://api.openai.com/v1' },
  gemini:   { defaultModel: 'gemini-1.5-flash' },
  groq:     { defaultModel: 'llama-3.3-70b-versatile',              baseUrl: 'https://api.groq.com/openai/v1' },
  kimi:     { defaultModel: 'moonshot-v1-32k',                      baseUrl: 'https://api.moonshot.cn/v1' },
  mistral:  { defaultModel: 'mistral-large-latest',                 baseUrl: 'https://api.mistral.ai/v1' },
  cohere:   { defaultModel: 'command-r-plus' },
  together: { defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', baseUrl: 'https://api.together.xyz/v1' },
};

// Local rate-limit helper — counts how many AI discovery calls the authed
// admin has logged via recordAdminAction in the last 24h. Hard cap at
// AI_DISCOVERY_DAILY_LIMIT to prevent a compromised admin session from
// burning unbounded amounts on OpenAI / Claude / etc.
const AI_DISCOVERY_DAILY_LIMIT = 200;
async function checkAiDiscoveryQuota(adminId: string): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  try {
    const admin = createAdminSupabaseClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('admin_actions')
      .select('id', { count: 'exact', head: true })
      .eq('admin_id', adminId)
      .eq('action', 'ai.discovery_query')
      .gte('created_at', since);
    if ((count ?? 0) >= AI_DISCOVERY_DAILY_LIMIT) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: `AI discovery quota reached (${AI_DISCOVERY_DAILY_LIMIT}/24h). Try again tomorrow.` },
          { status: 429 }
        ),
      };
    }
    return { ok: true };
  } catch {
    // If audit table can't be queried (migration pending), fail-open so
    // the admin isn't locked out by infrastructure issues.
    return { ok: true };
  }
}

// Look up a saved API key + model for a provider, if any. The api_key
// column is stored as an `enc:v1:` envelope (AES-256-GCM via
// lib/crypto/secret.ts) — decrypt here so callers receive the plaintext
// key they can actually present to the upstream provider. decryptSecret
// is a no-op on legacy plaintext rows, so this is safe pre + post
// migration to encrypted storage.
async function lookupStoredConfig(providerId: string): Promise<{ apiKey: string | null; model: string | null }> {
  try {
    const admin = createAdminSupabaseClient();
    const { data } = await admin
      .from('ai_provider_configs')
      .select('api_key, model')
      .eq('provider_id', providerId)
      .maybeSingle();
    if (!data) return { apiKey: null, model: null };
    let plain: string | null = null;
    try {
      plain = data.api_key ? decryptSecret(data.api_key) : null;
    } catch (err: any) {
      // Encrypted row but AI_KEYS_ENCRYPTION_KEY missing or wrong —
      // log and surface as "no stored key" so the caller falls back to
      // a clear "save a key" error rather than 401-ing the upstream
      // with a base64 blob.
      logError({ event: 'admin.ai_discovery.decrypt_stored_failed', provider_id: providerId, error: err?.message ?? String(err) });
    }
    return { apiKey: plain, model: data.model ?? null };
  } catch {
    return { apiKey: null, model: null };
  }
}

// Parse arbitrary AI text into an array of job objects.
function extractJSONArray(raw: string): any[] {
  let text = (raw ?? '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Try direct parse
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.jobs && Array.isArray(parsed.jobs)) return parsed.jobs;
    if (parsed?.results && Array.isArray(parsed.results)) return parsed.results;
    if (parsed?.data && Array.isArray(parsed.data)) return parsed.data;
  } catch { /* fall through */ }

  // Fallback: largest [...] block
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const arr = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(arr)) return arr;
    } catch { /* ignore */ }
  }

  // Fallback: largest {...} block containing a "jobs" array
  const oStart = text.indexOf('{');
  const oEnd   = text.lastIndexOf('}');
  if (oStart !== -1 && oEnd > oStart) {
    try {
      const obj = JSON.parse(text.slice(oStart, oEnd + 1));
      if (obj?.jobs && Array.isArray(obj.jobs)) return obj.jobs;
    } catch { /* ignore */ }
  }

  return [];
}

// ─── Anthropic (Claude) ───────────────────────────────────────────────────────
async function callClaude(apiKey: string, model: string, userMessage: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Anthropic ${res.status}`);
  }
  const data = await res.json();
  return data?.content?.[0]?.text ?? '';
}

// ─── OpenAI-compatible (OpenAI, Groq, Together, Kimi, Mistral) ────────────────
async function callOpenAICompat(
  baseUrl: string, apiKey: string, model: string, userMessage: string,
  supportsJsonMode: boolean,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userMessage },
    ],
    temperature: 0.6,
  };
  if (supportsJsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `API ${res.status}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// ─── Google Gemini ────────────────────────────────────────────────────────────
async function callGemini(apiKey: string, model: string, userMessage: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.6,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Gemini ${res.status}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ─── Cohere ───────────────────────────────────────────────────────────────────
async function callCohere(apiKey: string, model: string, userMessage: string): Promise<string> {
  const res = await fetch('https://api.cohere.ai/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      message: userMessage,
      preamble: SYSTEM_PROMPT,
      max_tokens: 4096,
      temperature: 0.6,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `Cohere ${res.status}`);
  }
  const data = await res.json();
  return data?.text ?? '';
}

const VALID_CATEGORIES = new Set(['engineering','design','marketing','finance','sales','data','hr','product','legal','operations','other']);
const VALID_TYPES      = new Set(['full-time','part-time','contract','freelance','internship']);
const VALID_LEVELS     = new Set(['entry','mid','senior','lead','executive']);

// ─── Main route handler ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  // Per-admin daily quota — a compromised admin session could otherwise rack
  // up tens of thousands of dollars in calls to paid LLM APIs.
  const quota = await checkAiDiscoveryQuota(auth.adminId);
  if (!quota.ok) return quota.res;

  let body: ProviderRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { providerId, query, maxJobs = 10 } = body;
  if (!providerId || !query) {
    return NextResponse.json({ error: 'providerId and query are required' }, { status: 400 });
  }

  // Log every successful discovery call so the daily quota check above can
  // count them. Fire-and-forget — audit failures shouldn't break the call.
  recordAdminAction({
    adminId:    auth.adminId,
    adminEmail: auth.adminEmail,
    action:     'ai.discovery_query',
    targetType: 'ai_provider',
    targetId:   providerId,
    metadata:   { query: query.slice(0, 200), maxJobs },
  }).catch(() => {});

  const config = PROVIDER_CONFIGS[providerId];
  if (!config) {
    return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 });
  }

  // Resolve API key + model: prefer the request body, fall back to the
  // stored config. The masked placeholder ("••••XXXX") is what the
  // settings page sends back when the admin reuses a saved key without
  // re-typing it — treat that the same as "no key in body" so the
  // stored-config fallback actually fires. Without this, the masked
  // string was being passed verbatim to the upstream provider, which
  // 401'd every reuse-after-save attempt.
  const bodyKeyClean = (typeof body.apiKey === 'string' && body.apiKey.startsWith('••••'))
    ? undefined
    : body.apiKey?.trim();
  const needsStored = !bodyKeyClean || !body.model;
  const stored = needsStored ? await lookupStoredConfig(providerId) : { apiKey: null, model: null };
  const apiKey = bodyKeyClean || stored.apiKey || '';
  const model  = body.model?.trim() || stored.model || config.defaultModel;

  if (!apiKey) {
    return NextResponse.json(
      { error: `No API key for ${providerId}. Save one in the Admin → AI Discovery settings.` },
      { status: 400 }
    );
  }

  const capped = Math.min(Math.max(1, Math.floor(maxJobs)), 30);
  const userMessage =
    `Search query: "${query}"\n\n` +
    `Generate ${capped} diverse remote job listings matching this query. ` +
    `Use REAL company names from your knowledge. ` +
    `Return ONLY a JSON object of the shape {"jobs": [ ... ]} — no markdown.`;

  let rawText = '';
  try {
    switch (providerId) {
      case 'claude':
        rawText = await callClaude(apiKey, model, userMessage);
        break;
      case 'gemini':
        rawText = await callGemini(apiKey, model, userMessage);
        break;
      case 'cohere':
        rawText = await callCohere(apiKey, model, userMessage);
        break;
      case 'openai':
      case 'groq':
      case 'mistral':
      case 'together':
        rawText = await callOpenAICompat(config.baseUrl!, apiKey, model, userMessage, /* json mode */ true);
        break;
      case 'kimi':
        // Moonshot's OpenAI-compatible endpoint historically lacked response_format support.
        rawText = await callOpenAICompat(config.baseUrl!, apiKey, model, userMessage, /* json mode */ false);
        break;
      default:
        return NextResponse.json({ error: `No handler for provider: ${providerId}` }, { status: 400 });
    }
  } catch (err: any) {
    // Provider SDK error strings can carry the upstream URL, auth
    // diagnostic, or model id — log raw, ship a generic shape.
    logError({ event: 'admin.ai_discovery.provider_call_failed', provider_id: providerId, error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Provider call failed.' }, { status: 502 });
  }

  const raw = extractJSONArray(rawText);

  // Sanitise & validate. Drop entries missing required fields.
  const sanitised = raw
    .filter((j: any) => j && typeof j === 'object' && j.title && j.company)
    .map((j: any) => {
      const type     = String(j.type     ?? 'full-time').toLowerCase();
      const category = String(j.category ?? 'other').toLowerCase();
      const level    = String(j.level    ?? 'mid').toLowerCase();
      return {
        title:       String(j.title).slice(0, 200),
        company:     String(j.company).slice(0, 200),
        location:    String(j.location ?? 'Remote').slice(0, 200),
        type:        VALID_TYPES.has(type) ? type : 'full-time',
        category:    VALID_CATEGORIES.has(category) ? category : 'other',
        level:       VALID_LEVELS.has(level) ? level : 'mid',
        description: String(j.description ?? '').slice(0, 4000),
        applyUrl:    String(j.applyUrl ?? j.url ?? '').slice(0, 500),
        salary:      j.salary ? String(j.salary).slice(0, 100) : undefined,
        remote:      true,
      };
    })
    .slice(0, capped);

  if (sanitised.length === 0) {
    return NextResponse.json({
      jobs: [],
      warning: 'Provider returned no valid jobs. The model may have replied in an unexpected format.',
    });
  }

  return NextResponse.json({ jobs: sanitised });
}
