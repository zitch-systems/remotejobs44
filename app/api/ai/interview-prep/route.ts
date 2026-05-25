// app/api/ai/interview-prep/route.ts
// Returns interview prep for a given role: likely questions, what they really
// test, model-answer skeletons, and red-flag mistakes to avoid.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { complete } from '@/lib/ai/provider';

const SYSTEM = `You are a senior interviewer at a global remote-first company who has interviewed hundreds of candidates from Africa, Asia, Europe and the Americas. Produce useful, specific interview prep. Output valid JSON only — no preface, no markdown fences.`;

const PROMPT = (role: string, level: string, focus: string) => `Generate a remote-job interview prep pack for: "${role}" (${level} level). Focus areas the candidate wants extra coverage on: ${focus || 'general'}.

Return JSON with exactly this shape:

{
  "role": "${role}",
  "level": "${level}",
  "behavioral_questions": [
    {"q": "...", "what_it_tests": "...", "structure": "STAR-style answer skeleton", "common_mistake": "..."}
  ],
  "technical_or_role_questions": [
    {"q": "...", "what_it_tests": "...", "structure": "outline of strong answer", "common_mistake": "..."}
  ],
  "remote_specific_questions": [
    {"q": "...", "what_it_tests": "...", "structure": "outline", "common_mistake": "..."}
  ],
  "questions_to_ask_them": ["...", "...", "..."],
  "red_flags_to_avoid": ["...", "...", "..."]
}

Give 4 behavioral, 4 technical/role, 3 remote-specific. Keep each answer skeleton under 60 words.`;

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const role: string  = String(body.role  ?? '').slice(0, 120).trim();
    const level: string = ['entry','mid','senior','lead','executive'].includes(body.level) ? body.level : 'mid';
    const focus: string = String(body.focus ?? '').slice(0, 300);

    if (!role || role.length < 3) {
      return NextResponse.json({ error: 'Please give a role (e.g. "Frontend Engineer").' }, { status: 400 });
    }

    const raw = await complete({
      system:    SYSTEM,
      prompt:    PROMPT(role, level, focus),
      maxTokens: 1500,
    });

    const json = safeParseJson(raw);
    if (!json) {
      return NextResponse.json({ error: 'AI returned unparseable output. Try again.', raw }, { status: 502 });
    }

    return NextResponse.json({ prep: json });
  } catch (err: any) {
    console.error('[ai/interview-prep]', err);
    return NextResponse.json({ error: err.message ?? 'Interview prep failed' }, { status: 500 });
  }
}

function safeParseJson(s: string): any | null {
  if (!s) return null;
  const cleaned = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
