// app/api/ai/cv-review/route.ts
// Reviews a member's CV text with the active AI provider and returns
// structured feedback: overall_score (0-100), strengths, gaps, rewrite_tips.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { complete } from '@/lib/ai/provider';

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
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      return NextResponse.json({ error: 'AI returned unparseable output. Try again.', raw }, { status: 502 });
    }

    return NextResponse.json({ review: json });
  } catch (err: any) {
    console.error('[ai/cv-review]', err);
    return NextResponse.json({ error: err.message ?? 'CV review failed' }, { status: 500 });
  }
}

// LLMs sometimes wrap JSON in fences despite instructions; strip and try once.
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
