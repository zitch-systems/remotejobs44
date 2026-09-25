'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Hero search island: input + "Search Jobs" → /jobs?q=<value>.
// Trending chips below navigate to category queries.
export function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');

  function go() {
    const v = q.trim();
    router.push(v ? `/jobs?q=${encodeURIComponent(v)}` : '/jobs');
  }

  const chips = ['Engineering', 'Design', 'Data', 'Marketing'];
  const chipLabels: Record<string, string> = { Data: 'Data & AI' };

  return (
    <>
      <div className="hb-search" role="search">
        <svg className="s-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          type="text"
          placeholder="Search remote jobs by role or skill…"
          aria-label="Search jobs"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') go(); }}
        />
        <button type="button" className="btn btn-primary" onClick={go}>Search Jobs</button>
      </div>
      <div className="hb-chips">
        <span className="lbl">Trending:</span>
        {chips.map(c => (
          <a key={c} className="hb-chip" href={`/jobs?q=${encodeURIComponent(c)}`}>
            {chipLabels[c] ?? c}
          </a>
        ))}
      </div>
    </>
  );
}
