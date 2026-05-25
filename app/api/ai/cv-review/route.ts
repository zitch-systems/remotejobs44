// app/api/ai/cv-review/route.ts
// Reviews a member's CV text with the active AI provider and returns
// structured feedback. Gated by:
//   - signed in (any plan can use a free trial of 1 review/day via rate limit)
//   - per-user rate limit so a single user can't burn admin's AI quota
//   - admin / pro / daily / pro_annual plans get a higher cap
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { complete } from '@/lib/ai/provider';
import { rateLimit } from '@/lib/rate-limit';

const SYSTEM = `You are a senior remote-hiring recruiter who reviews CVs for engineers, designers, marketers and operators applying to global remote roles from Africa. Be honest, specific, and brief. Output valid JSON only — no preface, no markdown fences.`;

const PROMPT = (cv: string, role: string) => `Review this CV for a candidate targeting "${role}" remote roles. Return JSON with this exact shape:

{
  "overall_score": <integer 0-100>,
  "headline_summary": "<one sentence: who this candidate is>",
  "strengths": ["...", "...", "..."],
  "gaps":     ["...", "...", "..."],
  "rewrite_tips": [
    {"section": "summary|experience|skills|education|projects", "tip": "specific actionable improvement"}
  ],
  "ats_keywords_missing": ["...", "...", "..."]
}

CV:
"""
${cv.slice(0, 8000)}
"""`;

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Sign in to use the AI CV review.' }, { status: 401 });

    // Per-user rate limit — free users 1/day, paid users 20/day.
    const { data: profile } = await supabase
      .from('profiles').select('plan, role').eq('id', user.id).maybeSingle();
    const plan = profile?.plan ?? 'free';
    const isPaid = profile?.role === 'admin' || ['admin','daily','pro'].includes(plan);
    const limit  = isPaid ? 20 : 1;
    const rl = rateLimit(`ai:cv:${user.id}`, limit, 24 * 60 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { error: isPaid
            ? `You've hit today's limit of ${limit} CV reviews. Try again tomorrow.`
            : `Free users get 1 AI CV review per day. Upgrade to Pro for ${20} per day.`,
          retryAt: rl.resetAt,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cv: string  = String(body.cv ?? '').trim();
    const role: string = String(body.role ?? 'Remote').slice(0, 100);

    if (!cv || cv.length < 50) {
      return NextResponse.json({ error: 'CV text is too short. Paste at least 50 characters.' }, { status: 400 });
    }
    if (cv.length > 12000) {
      return NextResponse.json({ error: 'CV text too long. Keep it under 12,000 characters.' }, { status: 400 });
    }

    const raw = await complete({
      system:    SYSTEM,
      prompt:    PROMPT(cv, role),
      maxTokens: 900,
    });

    const json = safeParseJson(raw);
    if (!json) {
      // Don't leak raw LLM output to the client — log it server-side instead.
      console.error('[ai/cv-review] unparseable response:', raw.slice(0, 1000));
      return NextResponse.json({ error: 'AI returned malformed output. Please try again in a moment.' }, { status: 502 });
    }

    return NextResponse.json({ review: json });
  } catch (err: any) {
    console.error('[ai/cv-review]', err);
    return NextResponse.json({ error: err.message ?? 'CV review failed' }, { status: 500 });
  }
}

function safeParseJson(s: string): any | null {
  if (!s) return null;
  const cleaned = s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}
