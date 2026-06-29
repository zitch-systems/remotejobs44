'use client';
// app/(member)/interview/page.tsx — AI Interview (mock session)
// A guided mock interview: question panel + timer on the left, your answer
// and live scored feedback on the right. Scoring is a local heuristic
// (clarity / depth / structure / keywords) so the session runs without AI
// quota; swap scoreAnswer() for an LLM grader to make it richer.
import { useEffect, useRef, useState } from 'react';
import { Info, Mic, ArrowRight } from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { useMemberGate } from '@/lib/member/use-member-gate';
import { MemberLoading } from '@/components/member/MemberLoading';

interface Question { num: number; category: string; text: string; hint: string; }

const SESSION = { role: 'Senior Frontend Engineer', company: 'Vercel', type: 'Technical' };

const QUESTIONS: Question[] = [
  { num: 1, category: 'Debugging', text: "Walk me through a complex frontend bug you've solved and how you found it.", hint: 'Think about: reproduction, isolating the cause, the fix, and what you changed to prevent a repeat.' },
  { num: 2, category: 'Performance', text: 'Describe your approach to performance optimisation in a large React app.', hint: 'Think about: measuring first, render cost, bundle size, memoisation tradeoffs.' },
  { num: 3, category: 'System Design', text: 'How would you architect a design-system component library that works across React, Vue, and vanilla JS?', hint: 'Think about: web components, design tokens, build tooling, DX tradeoffs.' },
  { num: 4, category: 'Accessibility', text: 'How do you make sure a complex interactive component is accessible?', hint: 'Think about: semantics, keyboard, focus management, ARIA, testing with a screen reader.' },
  { num: 5, category: 'Remote work', text: 'How do you stay aligned with a distributed team across timezones?', hint: 'Think about: async communication, written docs, overlap windows, decision records.' },
  { num: 6, category: 'Collaboration', text: 'Tell me about a time you disagreed with a teammate on a technical decision.', hint: 'Think about: the tradeoff, how you made the case, and how it resolved.' },
];

interface AnsweredQ { num: number; text: string; score: number; }
interface Scores { clarity: number; depth: number; structure: number; keywords: number; overall: number; critique: string; }

const clamp = (n: number, lo = 0, hi = 99) => Math.max(lo, Math.min(hi, Math.round(n)));

function scoreAnswer(ans: string): Scores {
  const text = ans.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length;
  const structureWords = (text.match(/\b(first|second|third|then|next|finally|because|therefore|for example|tradeoff|trade-off|however|approach|step)\b/gi) || []).length;
  const techWords = (text.match(/\b(react|typescript|component|api|performance|accessib\w*|cache|state|render|test\w*|architecture|design system|ssr|web component|token|bundle|memo)\b/gi) || []).length;

  const clarity = clamp(45 + (Math.min(words, 180) / 180) * 45 + sentences * 1.5);
  const depth = clamp(35 + (Math.min(words, 220) / 220) * 40 + techWords * 4);
  const structure = clamp(45 + structureWords * 9 + Math.min(sentences, 6) * 3);
  const keywords = clamp(40 + techWords * 8);
  const overall = clamp((clarity + depth + structure + keywords) / 4);

  const dims: [string, number][] = [['clarity', clarity], ['depth', depth], ['structure', structure], ['keyword coverage', keywords]];
  const lowest = dims.reduce((a, b) => (b[1] < a[1] ? b : a));
  const critique = overall >= 85
    ? 'Strong, well-structured answer with good technical specifics. Keep this depth across the session.'
    : `Solid start — to push higher, strengthen your ${lowest[0]}: add a concrete example and name the specific tradeoffs you weighed.`;

  return { clarity, depth, structure, keywords, overall, critique };
}

const barColor = (n: number) => (n >= 85 ? 'var(--success)' : n >= 75 ? 'var(--brand-500)' : 'var(--accent)');

function fmt(sec: number) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function AiInterviewPage() {
  const { ready } = useMemberGate();
  const { toast } = useUIStore();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [answered, setAnswered] = useState<AnsweredQ[]>([]);
  const [scores, setScores] = useState<Scores | null>(null);
  const [seconds, setSeconds] = useState(272); // 04:32
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  if (!ready) return <MemberLoading />;

  const current = QUESTIONS[index];
  const done = index >= QUESTIONS.length;
  const runningScore = answered.length
    ? Math.round(answered.reduce((a, q) => a + q.score, 0) / answered.length)
    : (scores?.overall ?? 0);

  function submit() {
    if (!current || answer.trim().length < 20) {
      toast('Write a fuller answer (20+ characters) before submitting.', 'error');
      return;
    }
    const s = scoreAnswer(answer);
    setScores(s);
    setAnswered((prev) => [{ num: current.num, text: current.text, score: s.overall }, ...prev]);
    setAnswer('');
    setIndex((i) => i + 1);
  }

  function endSession() {
    setIndex(0); setAnswer(''); setAnswered([]); setScores(null); setSeconds(272);
    toast('Session reset', 'info');
  }

  return (
    <div className="tool">
      <div className="tool-topbar">
        <h1>AI Interview</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="timer"><span className="dot" />{fmt(seconds)}</div>
          <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>
            {done ? 'Session complete' : `Question ${current.num} of ${QUESTIONS.length}`}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={endSession}>End session</button>
        </div>
      </div>

      <div className="ai-body tool-two">
        <div className="q-panel">
          <div className="session-info">
            <span className="sichip">{SESSION.role}</span>
            <span className="sichip">{SESSION.company}</span>
            <span className="sichip">{SESSION.type}</span>
          </div>
          <div className="q-progress">
            {QUESTIONS.map((q, i) => (
              <div key={q.num} className={`q-dot${i < index ? ' done' : i === index ? ' curr' : ''}`} />
            ))}
          </div>

          {done ? (
            <div className="q-card">
              <div className="q-num">All done</div>
              <p className="q-text">Session complete — final running score {runningScore}.</p>
              <div className="q-hint"><Info />Hit “End session” to start a fresh round, or review your scored answers below.</div>
            </div>
          ) : (
            <div className="q-card">
              <div className="q-num">Question {current.num} · {current.category}</div>
              <p className="q-text">{current.text}</p>
              <div className="q-hint"><Info />{current.hint}</div>
            </div>
          )}

          {answered.map((q) => (
            <div className="past-q" key={q.num}>
              <div className="pq-label">✓ Q{q.num} — Answered</div>
              <div className="pq-t">{q.text}</div>
              <div className="pq-score">
                <span>Score</span>
                <div className="pq-bar"><i style={{ width: `${q.score}%` }} /></div>
                <span>{q.score}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="r-panel">
          <div className="r-card">
            <h3>Your answer</h3>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here, or speak and we'll transcribe…"
              disabled={done}
            />
            <div className="r-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => toast('Voice input is coming soon', 'info')} disabled={done}>
                <Mic style={{ width: 15, height: 15 }} /> Use voice
              </button>
              <button className="btn btn-primary btn-sm" onClick={submit} disabled={done}>
                Submit answer <ArrowRight style={{ width: 15, height: 15 }} />
              </button>
            </div>
          </div>

          <div className="score-card">
            <h3>Live feedback</h3>
            {scores ? (
              <>
                <div className="overall-score">
                  <div className="big">{runningScore}</div>
                  <div className="label">Running score · {answered.length} answered</div>
                </div>
                {([['Clarity', scores.clarity], ['Depth', scores.depth], ['Structure', scores.structure], ['Keywords', scores.keywords]] as [string, number][]).map(([lab, n]) => (
                  <div className="score-row" key={lab}>
                    <span className="sr-label">{lab}</span>
                    <div className="sr-bar"><i style={{ width: `${n}%`, background: barColor(n) }} /></div>
                    <span className="sr-n">{n}</span>
                  </div>
                ))}
                <p style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 10, lineHeight: 1.5 }}>{scores.critique}</p>
              </>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--fg-3)', lineHeight: 1.5 }}>
                Submit your first answer to see a live breakdown across clarity, depth, structure and keyword coverage.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
