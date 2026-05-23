// app/api/admin/ai-discovery/route.ts
// Server-side proxy for AI provider calls — keeps API keys off the client
import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are a remote job discovery agent. Given a search query, generate a list of realistic, currently-available remote job listings.

For each job, provide:
- title: exact job title
- company: company name (use real companies when possible)
- location: "Remote" or "Remote - [Region]" or specific city/country
- type: "full-time" | "part-time" | "contract" | "freelance"
- category: one of: engineering, design, marketing, finance, sales, data, hr, product, legal, operations, other
- level: "entry" | "mid" | "senior" | "lead" | "executive"
- description: 2-3 sentences describing the role
- applyUrl: realistic job URL (e.g. https://boards.greenhouse.io/company/jobs/12345)
- salary: optional salary range (e.g. "$80,000 - $120,000/yr")
- remote: true (MUST be true - only include remote jobs)

Return ONLY a valid JSON array. No markdown, no explanation. Example:
[{"title":"Senior React Engineer","company":"Stripe","location":"Remote - Worldwide","type":"full-time","category":"engineering","level":"senior","description":"...","applyUrl":"https://stripe.com/jobs/...","salary":"$160,000-$200,000/yr","remote":true}]

CRITICAL: Only include REMOTE jobs. Reject any in-office or hybrid-only positions.`;

type ProviderRequest = {
  providerId: string;
  apiKey: string;
  model: string;
  query: string;
  maxJobs: number;
};

// ─── Provider base URLs ───────────────────────────────────────────────────────
const PROVIDER_CONFIGS: Record<string, { baseUrl: string; defaultModel: string }> = {
  claude:   { baseUrl: 'https://api.anthropic.com/v1',                      defaultModel: 'claude-opus-4-6' },
  openai:   { baseUrl: 'https://api.openai.com/v1',                         defaultModel: 'gpt-4o' },
  gemini:   { baseUrl: 'https://generativelanguage.googleapis.com/v1beta',   defaultModel: 'gemini-2.0-flash-exp' },
  groq:     { baseUrl: 'https://api.groq.com/openai/v1',                    defaultModel: 'llama-3.3-70b-versatile' },
  kimi:     { baseUrl: 'https://api.moonshot.cn/v1',                        defaultModel: 'moonshot-v1-32k' },
  mistral:  { baseUrl: 'https://api.mistral.ai/v1',                         defaultModel: 'mistral-large-latest' },
  cohere:   { baseUrl: 'https://api.cohere.ai/v1',                          defaultModel: 'command-r-plus' },
  together: { baseUrl: 'https://api.together.xyz/v1',                       defaultModel: 'meta-llama/Llama-3-70b-chat-hf' },
};

// ─── Parse raw text → JSON array ─────────────────────────────────────────────
function extractJSONArray(raw: string): any[] {
  // Strip markdown code fences if present
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Try direct parse first
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    // Some providers wrap in { jobs: [] }
    if (parsed?.jobs && Array.isArray(parsed.jobs)) return parsed.jobs;
    if (parsed?.results && Array.isArray(parsed.results)) return parsed.results;
  } catch { /* fall through */ }

  // Find first [ ... ] block
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const arr = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(arr)) return arr;
    } catch { /* fall through */ }
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
      max_tokens: 4096,
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

// ─── OpenAI-compatible (OpenAI, Groq, Together, Kimi, Mistral) ───────────────
async function callOpenAICompat(
  baseUrl: string, apiKey: string, model: string, userMessage: string
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMessage },
      ],
      temperature: 0.7,
    }),
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
      generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
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
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `Cohere ${res.status}`);
  }
  const data = await res.json();
  return data?.text ?? '';
}

// ─── Main route handler ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: ProviderRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { providerId, apiKey, model, query, maxJobs = 10 } = body;

  if (!providerId || !query) {
    return NextResponse.json({ error: 'providerId and query are required' }, { status: 400 });
  }

  const config = PROVIDER_CONFIGS[providerId];
  if (!config) {
    return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 });
  }

  const resolvedModel = model?.trim() || config.defaultModel;
  const userMessage   = `Search query: "${query}"\n\nGenerate ${maxJobs} remote job listings matching this query. Return only valid JSON array.`;

  let rawText = '';

  try {
    switch (providerId) {
      case 'claude':
        rawText = await callClaude(apiKey, resolvedModel, userMessage);
        break;

      case 'gemini':
        rawText = await callGemini(apiKey, resolvedModel, userMessage);
        break;

      case 'cohere':
        rawText = await callCohere(apiKey, resolvedModel, userMessage);
        break;

      // OpenAI-compatible: openai, groq, kimi, mistral, together
      case 'openai':
      case 'groq':
      case 'kimi':
      case 'mistral':
      case 'together':
        rawText = await callOpenAICompat(config.baseUrl, apiKey, resolvedModel, userMessage);
        break;

      default:
        return NextResponse.json({ error: `No handler for provider: ${providerId}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Provider call failed' }, { status: 502 });
  }

  const jobs = extractJSONArray(rawText);

  // Sanitise & enforce remote flag
  const sanitised = jobs
    .filter((j: any) => j && typeof j === 'object')
    .map((j: any) => ({
      title:       String(j.title       ?? 'Untitled'),
      company:     String(j.company     ?? 'Unknown'),
      location:    String(j.location    ?? 'Remote'),
      type:        String(j.type        ?? 'full-time'),
      category:    String(j.category    ?? 'other'),
      level:       String(j.level       ?? 'mid'),
      description: String(j.description ?? ''),
      applyUrl:    String(j.applyUrl    ?? ''),
      salary:      j.salary ? String(j.salary) : undefined,
      remote:      true,  // always true — we only want remote
    }))
    .slice(0, maxJobs);

  return NextResponse.json({ jobs: sanitised });
}
ing(j.applyUrl    ?? ''),
      salaryMin:   Number(j.salaryMin   ?? 0) || null,
      salaryMax:   Number(j.salaryMax   ?? 0) || null,
      currency:    String(j.currency    ?? 'USD'),
      skills:      Array.isArray(j.skills) ? j.skills.map(String) : [],
      featured:    Boolean(j.featured   ?? false),
      remote:      Boolean(j.remote     ?? true),
    }));

  return NextResponse.json({ jobs: sanitised, total: sanitised.length });
}
