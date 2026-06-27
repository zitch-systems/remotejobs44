import { ReactNode } from 'react';

interface Cap { title: string; body: string; icon: ReactNode; }

const CAPS: Cap[] = [
  {
    title: 'Daily job alerts',
    body: 'New roles matching your filters land in your inbox every morning — before they fill up.',
    icon: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  },
  {
    title: 'Saved searches',
    body: 'Pin the exact category, salary and region you want and pick up right where you left off.',
    icon: <><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></>,
  },
  {
    title: 'One-click apply',
    body: 'Send your saved CV straight to the employer — no re-typing the same form ten times.',
    icon: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></>,
  },
  {
    title: 'Application tracker',
    body: 'Follow every application from sent to interview to offer in one tidy dashboard.',
    icon: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  },
  {
    title: 'Salary insights',
    body: 'See real pay bands in USD for every role and level so you negotiate from a position of knowledge.',
    icon: <><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></>,
  },
  {
    title: 'Verified employers',
    body: 'Every company is checked to actually hire remotely — no ghost listings, no dead ends.',
    icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>,
  },
];

export function Capabilities() {
  return (
    <section className="sec sec--tint">
      <div className="wrap">
        <div className="section-head">
          <span className="section-kicker">The RemoteJobs44 toolkit</span>
          <h2>Everything you need to land the role</h2>
          <p>One account, the full job-hunt stack — from first search to signed offer.</p>
        </div>
        <div className="cap-grid">
          {CAPS.map(c => (
            <div className="cap-tile" key={c.title}>
              <span className="cap-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {c.icon}
                </svg>
              </span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
        <div className="statline">
          <div className="si"><div className="n">70,000+</div><div className="l">Live roles indexed and refreshed every day</div></div>
          <div className="si"><div className="n">100% verified</div><div className="l">Every listing checked to actually hire remotely</div></div>
          <div className="si"><div className="n">Free forever</div><div className="l">Browse and save at no cost — pay only when you apply</div></div>
        </div>
      </div>
    </section>
  );
}
