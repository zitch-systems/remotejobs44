'use client';
// app/(member)/match/page.tsx — Job Match
// Paste a JD → see matched / gap / partial keywords + a match score + tips.
// The analysis is local + deterministic (no AI quota): it compares the
// keywords present in the JD against the member's CV skills. Swap analyse()
// for an LLM call when richer matching is wanted — the UI only needs the
// MatchResult shape.
import { useMemo, useRef, useState } from 'react';
import { BarChart3, Lightbulb } from 'lucide-react';
import { useMemberGate } from '@/lib/member/use-member-gate';
import { MemberLoading } from '@/components/member/MemberLoading';

// Keyword dictionary grouped so "related but not identical" skills can be
// surfaced as partial matches.
const SKILL_GROUPS: Record<string, string[]> = {
  'Frontend frameworks': ['react', 'vue', 'angular', 'svelte', 'next.js', 'nextjs', 'remix'],
  'Languages': ['javascript', 'typescript'],
  'Styling': ['css', 'tailwind', 'sass', 'styled-components'],
  'Backend': ['node.js', 'nodejs', 'express', 'python', 'django', 'go', 'golang', 'ruby', 'rails', 'java', 'php', 'laravel'],
  'APIs': ['graphql', 'rest', 'grpc', 'trpc'],
  'Cloud': ['aws', 'gcp', 'azure', 'vercel', 'netlify', 'cloudflare'],
  'DevOps': ['docker', 'kubernetes', 'ci/cd', 'terraform'],
  'Data': ['sql', 'postgres', 'postgresql', 'mysql', 'mongodb', 'redis'],
  'Testing': ['jest', 'cypress', 'playwright', 'vitest'],
  'Engineering practices': ['accessibility', 'a11y', 'performance', 'seo', 'design systems', 'component library', 'ssr', 'web components'],
  'Ways of working': ['remote', 'async', 'communication', 'leadership', 'mentoring', 'collaboration', 'agile'],
  'Tools': ['git', 'figma', 'jira'],
};

const LABELS: Record<string, string> = {
  'next.js': 'Next.js', nextjs: 'Next.js', 'node.js': 'Node.js', nodejs: 'Node.js',
  typescript: 'TypeScript', javascript: 'JavaScript', css: 'CSS', graphql: 'GraphQL',
  rest: 'REST', aws: 'AWS', gcp: 'GCP', sql: 'SQL', 'ci/cd': 'CI/CD', a11y: 'Accessibility',
  ssr: 'SSR', seo: 'SEO',
};
const label = (k: string) => LABELS[k] ?? k.replace(/\b\w/g, (c) => c.toUpperCase());

const KEYWORD_TO_GROUP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [group, words] of Object.entries(SKILL_GROUPS)) for (const w of words) m[w] = group;
  return m;
})();

interface MatchResult {
  score: number;
  total: number;
  matched: string[];
  gaps: string[];
  partial: string[];
  tips: string[];
}

function userSkills(): string[] {
  // Pull from the CV Builder draft if present, else a sensible default.
  try {
    const raw = localStorage.getItem('rj44-cv-draft');
    if (raw) {
      const cv = JSON.parse(raw) as { skills?: string };
      const list = (cv.skills ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (list.length) return list;
    }
  } catch { /* ignore */ }
  return ['react', 'typescript', 'next.js', 'graphql', 'node.js', 'figma', 'git', 'css'];
}

function analyse(jd: string): MatchResult {
  const text = ` ${jd.toLowerCase()} `;
  const has = (kw: string) => text.includes(kw.length <= 3 ? ` ${kw} ` : kw);

  // Distinct JD keywords (by display label, keeping first group seen).
  const found = new Map<string, string>(); // label -> group
  for (const [kw, group] of Object.entries(KEYWORD_TO_GROUP)) {
    if (has(kw)) found.set(label(kw), group);
  }

  const skills = userSkills();
  const skillLabels = new Set(skills.map(label));
  const skillGroups = new Set(skills.map((s) => KEYWORD_TO_GROUP[s]).filter(Boolean));

  const matched: string[] = [];
  const gaps: string[] = [];
  const partial: string[] = [];
  for (const [lab, group] of found) {
    if (skillLabels.has(lab)) matched.push(lab);
    else if (skillGroups.has(group)) partial.push(lab);
    else gaps.push(lab);
  }

  const total = found.size;
  const score = total === 0 ? 0 : Math.round((100 * (matched.length + 0.5 * partial.length)) / total);

  const tips: string[] = [];
  if (gaps.length) tips.push(`Add ${gaps.slice(0, 2).join(' and ')} to your CV — ${gaps.length > 2 ? 'they’re' : 'it’s'} called out in this JD and missing from your skills.`);
  if (partial.length) tips.push(`You’re close on ${partial[0]} — name your specific ${found.get(partial[0]) ?? 'related'} experience explicitly.`);
  if (matched.length) tips.push(`Lead your summary with ${matched.slice(0, 2).join(' and ')} — ${matched.length > 1 ? 'they’re' : 'it’s'} a top signal for this role.`);
  tips.push('Mirror the JD’s exact wording where you honestly can — ATS filters match literal keywords, not synonyms.');

  return { score, total, matched, gaps, partial, tips };
}

const SCORE_LABEL = (n: number) =>
  n >= 85 ? 'Strong match' : n >= 70 ? 'Good match' : n >= 50 ? 'Partial match' : 'Weak match';

export default function JobMatchPage() {
  const { ready } = useMemberGate();
  const [jd, setJd] = useState('');
  const [result, setResult] = useState<MatchResult | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const canAnalyse = useMemo(() => jd.trim().length >= 40, [jd]);

  if (!ready) return <MemberLoading />;

  function run() {
    if (!canAnalyse) return;
    setResult(analyse(jd));
  }
  function reset() {
    setJd('');
    setResult(null);
    taRef.current?.focus();
  }

  return (
    <div className="tool">
      <div className="tool-topbar">
        <h1>Job Match</h1>
        <button className="btn btn-ghost btn-sm" onClick={reset}>Analyse new JD</button>
      </div>

      <div className="jm-body tool-two">
        <div className="jm-left">
          <label htmlFor="jm-jd">Paste job description</label>
          <textarea
            id="jm-jd"
            ref={taRef}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the full job description here — requirements, responsibilities, the lot — then hit Analyse."
          />
          <button className="btn btn-primary" disabled={!canAnalyse} onClick={run}>
            Analyse match
          </button>
          {!canAnalyse && jd.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>Paste a bit more of the JD to analyse (40+ characters).</span>
          )}
        </div>

        <div className="jm-right">
          {!result ? (
            <div className="jm-empty">
              <BarChart3 />
              <div>Paste a job description and hit <b>Analyse</b> to see your match score and keyword gaps.</div>
            </div>
          ) : (
            <>
              <div className="jm-gauge">
                <div className="big">{result.score}%</div>
                <div className="lbl">{SCORE_LABEL(result.score)} · your CV covers {result.matched.length} of {result.total} required signals</div>
                <div className="match-bar"><i style={{ width: `${result.score}%` }} /></div>
              </div>

              <div className="jm-sec">
                <h4>Matched keywords <span className="ct">{result.matched.length} matched</span></h4>
                <div className="kw-wrap">
                  {result.matched.length
                    ? result.matched.map((k) => <span key={k} className="kw match">{k}</span>)
                    : <span style={{ fontSize: 13, color: 'var(--fg-4)' }}>None yet — add relevant skills to your CV.</span>}
                </div>
              </div>

              <div className="jm-sec">
                <h4>Gaps to address <span className="ct">{result.gaps.length} missing</span></h4>
                <div className="kw-wrap">
                  {result.gaps.length
                    ? result.gaps.map((k) => <span key={k} className="kw gap">{k}</span>)
                    : <span style={{ fontSize: 13, color: 'var(--fg-4)' }}>No obvious gaps — nice.</span>}
                </div>
              </div>

              {result.partial.length > 0 && (
                <div className="jm-sec">
                  <h4>Partial matches <span className="ct">{result.partial.length} partial</span></h4>
                  <div className="kw-wrap">
                    {result.partial.map((k) => <span key={k} className="kw partial">{k}</span>)}
                  </div>
                </div>
              )}

              <div className="jm-sec">
                <h4>How to win this one</h4>
                {result.tips.map((t, i) => (
                  <div className="tip-row" key={i}><Lightbulb /><span>{t}</span></div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
