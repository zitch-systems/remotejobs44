'use client';
// app/(member)/cover-letters/page.tsx — Cover Letter Generator
// Composes a tailored letter from role/company/tone/key-points. The
// generator is local + deterministic (a clean seam to swap for an AI call:
// POST the same inputs to an LLM endpoint and drop the result into `paras`).
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { useAuthStore, useUIStore } from '@/lib/store';
import { useMemberGate } from '@/lib/member/use-member-gate';
import { MemberLoading } from '@/components/member/MemberLoading';

type Tone = 'Professional' | 'Enthusiastic' | 'Concise' | 'Conversational';
const TONES: Tone[] = ['Professional', 'Enthusiastic', 'Concise', 'Conversational'];

interface LetterInputs {
  role: string;
  company: string;
  manager: string;
  tone: Tone;
  points: string;
}

const DEFAULTS: LetterInputs = {
  role: 'Senior Frontend Engineer',
  company: 'Vercel',
  manager: '',
  tone: 'Professional',
  points: '6 years React experience, shipped 3 production design systems, remote-first for 4 years, open-source contributor.',
};

const DRAFTS_KEY = 'rj44-cover-letters';

function bulletsFromPoints(points: string): string[] {
  return points
    .split(/[,\n;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function generate(i: LetterInputs, name: string, email: string): string[] {
  const greeting = i.manager.trim()
    ? `Dear ${i.manager.trim()},`
    : `Dear ${i.company || 'Hiring'} Hiring Team,`;
  const pts = bulletsFromPoints(i.points);
  const ptsSentence = pts.length
    ? pts.slice(0, 4).join('; ') + '.'
    : 'a track record of shipping reliable, user-focused software.';

  const intros: Record<Tone, string> = {
    Professional: `I'm writing to apply for the ${i.role || 'role'} position at ${i.company || 'your company'}. I believe my background makes me a strong fit for your team.`,
    Enthusiastic: `I was thrilled to come across the ${i.role || 'role'} opening at ${i.company || 'your company'} — it's exactly the kind of role I've been working toward, and I'd love to contribute!`,
    Concise: `I'm applying for the ${i.role || 'role'} role at ${i.company || 'your company'}. Here's why I'm a strong fit.`,
    Conversational: `I'd love to throw my hat in the ring for the ${i.role || 'role'} role at ${i.company || 'your company'} — it looks like a great match for what I do best.`,
  };

  const body: Record<Tone, string> = {
    Professional: `Across my career I've focused on ${ptsSentence} I work effectively in remote, asynchronous teams and pride myself on clear written communication and dependable delivery.`,
    Enthusiastic: `What I bring: ${ptsSentence} I thrive in fast-moving remote teams and genuinely love the craft — I'd jump in ready to make an impact from week one.`,
    Concise: `Relevant strengths: ${ptsSentence} Fully remote-ready, strong written communicator, ships on time.`,
    Conversational: `A bit about me: ${ptsSentence} I've been remote for years, so async collaboration and over-communicating the right things come naturally.`,
  };

  const close: Record<Tone, string> = {
    Professional: `I'd welcome the opportunity to discuss how I can contribute to ${i.company || 'your team'}. My CV and portfolio are attached.`,
    Enthusiastic: `I'd be delighted to chat about how I can help ${i.company || 'your team'} win. Thank you so much for considering my application!`,
    Concise: `Happy to share more. CV and portfolio attached.`,
    Conversational: `Would love to talk it through whenever works for you. CV and portfolio are attached — thanks for reading!`,
  };

  return [
    greeting,
    intros[i.tone],
    body[i.tone],
    close[i.tone],
    `${i.tone === 'Professional' ? 'Warm regards' : i.tone === 'Concise' ? 'Best' : 'Best regards'},\n${name}${email ? `\n${email}` : ''}`,
  ];
}

export default function CoverLetterPage() {
  const { ready } = useMemberGate();
  const { user } = useAuthStore();
  const { toast } = useUIStore();
  const [inputs, setInputs] = useState<LetterInputs>(DEFAULTS);
  const [paras, setParas] = useState<string[]>([]);
  const [draftCount, setDraftCount] = useState(0);

  const name = user?.name || 'Ada Obi';
  const email = user?.email || '';

  // Initial generation + draft count once ready.
  useEffect(() => {
    setParas(generate(DEFAULTS, user?.name || 'Ada Obi', user?.email || ''));
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      setDraftCount(raw ? (JSON.parse(raw) as unknown[]).length : 0);
    } catch { /* ignore */ }
  }, [user?.name, user?.email]);

  const letterText = useMemo(() => paras.join('\n\n'), [paras]);

  if (!ready) return <MemberLoading />;

  const set = <K extends keyof LetterInputs>(k: K, v: LetterInputs[K]) =>
    setInputs((s) => ({ ...s, [k]: v }));

  function regenerate() {
    setParas(generate(inputs, name, email));
    toast('Letter regenerated', 'success');
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(letterText);
      toast('Copied to clipboard', 'success');
    } catch {
      toast('Copy failed — select and copy manually', 'error');
    }
  }

  function saveDraft() {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      const drafts = raw ? (JSON.parse(raw) as unknown[]) : [];
      drafts.unshift({ ...inputs, text: letterText, savedAt: new Date().toISOString() });
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.slice(0, 20)));
      setDraftCount(drafts.length);
      toast('Draft saved', 'success');
    } catch {
      toast('Could not save draft', 'error');
    }
  }

  return (
    <div className="tool">
      <div className="tool-topbar">
        <h1>Cover Letter Generator</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {draftCount > 0 && (
            <span className="draft-chip"><Check /> {draftCount} draft{draftCount === 1 ? '' : 's'} saved</span>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>Download PDF</button>
        </div>
      </div>

      <div className="cl-body tool-two">
        <div className="cl-inputs">
          <div className="input-sec">
            <h3>Role details</h3>
            <div className="field"><label>Job title</label><input value={inputs.role} onChange={(e) => set('role', e.target.value)} /></div>
            <div className="field"><label>Company name</label><input value={inputs.company} onChange={(e) => set('company', e.target.value)} /></div>
            <div className="field"><label>Hiring manager (optional)</label><input placeholder="e.g. Sarah Chen" value={inputs.manager} onChange={(e) => set('manager', e.target.value)} /></div>
          </div>

          <div className="input-sec">
            <h3>Tone</h3>
            <div className="tone-grid">
              {TONES.map((t) => (
                <button key={t} className={`tone-btn${inputs.tone === t ? ' on' : ''}`} onClick={() => set('tone', t)}>{t}</button>
              ))}
            </div>
          </div>

          <div className="input-sec">
            <h3>Key points to highlight</h3>
            <div className="field">
              <textarea
                value={inputs.points}
                onChange={(e) => set('points', e.target.value)}
                placeholder="e.g. 6 years React experience, open-source contributions, remote-first work history…"
              />
            </div>
          </div>

          <button className="btn btn-primary gen-btn" onClick={regenerate}>
            <Sparkles style={{ width: 17, height: 17 }} /> Regenerate letter
          </button>
        </div>

        <div className="cl-preview">
          <div className="letter-card">
            <div className="lc-meta">
              To: <b>{inputs.company || 'Hiring'} {inputs.manager ? '' : 'Team'}</b> &nbsp;·&nbsp;
              Role: <b>{inputs.role || '—'}</b> &nbsp;·&nbsp;
              Tone: <b>{inputs.tone}</b>
            </div>
            <div className="letter-body">
              {paras.map((p, i) => (
                <p key={i}>
                  {p.split('\n').map((line, j) => (
                    <span key={j}>{line}{j < p.split('\n').length - 1 ? <br /> : null}</span>
                  ))}
                </p>
              ))}
            </div>
            <div className="letter-actions">
              <button className="btn btn-ghost btn-sm" onClick={copyText}>Copy text</button>
              <button className="btn btn-ghost btn-sm" onClick={regenerate}>Regenerate</button>
              <button className="btn btn-primary btn-sm" onClick={saveDraft}>Save draft</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
