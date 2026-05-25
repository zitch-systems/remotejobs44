// lib/ai/provider.ts
// Reads the currently-enabled AI provider config from public.ai_provider_configs
// (managed by admins on /admin/ai-discovery) and gives the app a single
// complete() function that hides the provider-specific HTTP shape.
//
// Supports OpenAI-compatible APIs (openai, groq, together, mistral, kimi,
// cohere) and Anthropic Claude. Picks the first enabled config; if more than
// one is enabled, Claude wins, otherwise OpenAI, otherwise first found.
import { createAdminSupabaseClient } from '@/lib/supabase/server';

export interface AiConfig {
  providerId: string;
  apiKey: string;
  model: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  claude:   'claude-sonnet-4-5-20250929',
  openai:   'gpt-4o-mini',
  gemini:   'gemini-1.5-flash',
  groq:     'llama-3.3-70b-versatile',
  kimi:     'moonshot-v1-8k',
  mistral:  'mistral-small-latest',
  cohere:   'command-r',
  together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
};

// Preference order if multiple providers are enabled.
const PREFERENCE = ['claude', 'openai', 'gemini', 'groq', 'mistral', 'together', 'kimi', 'cohere'];

export async function loadActiveAiConfig(): Promise<AiConfig | null> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('ai_provider_configs')
      .select('provider_id, api_key, model, enabled')
      .eq('enabled', true);
    if (error || !data?.length) return null;

    const valid = data.filter((r: any) => !!r.api_key);
    if (!valid.length) return null;

    valid.sort(
      (a: any, b: any) =>
        PREFERENCE.indexOf(a.provider_id) - PREFERENCE.indexOf(b.provider_id)
    );
    const top = valid[0];
    return {
      providerId: top.provider_id,
      apiKey:     top.api_key,
      model:      top.model || DEFAULT_MODELS[top.provider_id] || 'gpt-4o-mini',
    };
  } catch {
    return null;
  }
}

// Returns plain text completion. Throws on transport/HTTP errors so the caller
// can render a clear "AI temporarily unavailable" message.
export async function complete(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  config?: AiConfig | null;
}): Promise<string> {
  const cfg = opts.config ?? (await loadActiveAiConfig());
  if (!cfg) throw new Error('No AI provider configured. Ask an admin to enable one on /admin/ai-discovery.');

  const maxTokens = opts.maxTokens ?? 800;

  if (cfg.providerId === 'claude') {
    return callAnthropic(cfg, opts.system, opts.prompt, maxTokens);
  }
  if (cfg.providerId === 'gemini') {
    return callGemini(cfg, opts.system, opts.prompt, maxTokens);
  }
  return callOpenAiCompatible(cfg, opts.system, opts.prompt, maxTokens);
}

async function callAnthropic(cfg: AiConfig, system: string, prompt: string, maxTokens: number): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw aiError('Anthropic', r, await r.text());
  const j = await r.json();
  return j.content?.[0]?.text ?? '';
}

async function callGemini(cfg: AiConfig, system: string, prompt: string, maxTokens: number): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw aiError('Gemini', r, await r.text());
  const j = await r.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// OpenAI / Groq / Together / Mistral / Kimi / Cohere all speak the
// OpenAI Chat Completions schema (or are close enough that this works).
async function callOpenAiCompatible(cfg: AiConfig, system: string, prompt: string, maxTokens: number): Promise<string> {
  const base: Record<string, string> = {
    openai:   'https://api.openai.com/v1',
    groq:     'https://api.groq.com/openai/v1',
    together: 'https://api.together.xyz/v1',
    mistral:  'https://api.mistral.ai/v1',
    kimi:     'https://api.moonshot.cn/v1',
    cohere:   'https://api.cohere.ai/compatibility/v1',
  };
  const endpoint = `${base[cfg.providerId] ?? base.openai}/chat/completions`;

  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw aiError(cfg.providerId, r, await r.text());
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? '';
}

// Builds a safe-to-bubble-up error. The raw body is logged server-side only;
// the message we surface mentions just status + provider so we never echo back
// an API key, partial prompt, or other sensitive content the provider may
// include in its own error responses.
function aiError(provider: string, r: Response, body: string): Error {
  console.error(`[ai/${provider}] HTTP ${r.status} ${r.statusText}: ${body.slice(0, 1500)}`);
  return new Error(`${provider} API returned ${r.status}. Try again or contact support.`);
}
