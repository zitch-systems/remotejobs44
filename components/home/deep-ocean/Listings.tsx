'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LandingJob, payLabel, ageLabel, tintFor, compactCount } from './helpers';

// The four categories surfaced in the filter rail; counts come live from
// the page (keyed by slug = DB category value), and each row links into the
// real filtered /jobs listing.
const RAIL_CATS = [
  { slug: 'engineering', name: 'Engineering' },
  { slug: 'design',      name: 'Design' },
  { slug: 'marketing',   name: 'Marketing' },
  { slug: 'data',        name: 'Data & AI' },
];

// Live-filter listings: filter-rail (static affordance) + client-filtered
// job rows. Filtering happens over the rows already rendered (progressive
// enhancement); "Load more" links to the full /jobs page.
function FilterTick() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function JobRow({ job }: { job: LandingJob }) {
  const tint = tintFor(job.company);
  return (
    <Link href={`/jobs/${job.id}`} className={`job-row${job.featured ? ' job-row--featured' : ''}`}>
      <span className="job-logo" style={{ ['--lm-bg' as string]: tint.bg, ['--lm-fg' as string]: tint.fg }}>
        {job.logo}
      </span>
      <span className="job-main">
        <span className="job-title">{job.title}</span>
        <span className="job-meta">{job.company} · {job.location}</span>
      </span>
      <span className="job-tag">{job.location}</span>
      <span className="job-pay">{payLabel(job)}</span>
      <span className="job-age">{ageLabel(job)}</span>
      <svg className="job-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

export function Listings({ jobs, categoryCounts = {} }: { jobs: LandingJob[]; categoryCounts?: Record<string, number> }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter(
      j =>
        j.title.toLowerCase().includes(needle) ||
        j.company.toLowerCase().includes(needle) ||
        j.location.toLowerCase().includes(needle) ||
        j.category.toLowerCase().includes(needle),
    );
  }, [q, jobs]);

  return (
    <section className="sec" id="listing">
      <div className="wrap wrap--wide">
        <div className="section-head" style={{ textAlign: 'left', margin: '0 0 32px', maxWidth: 680 }}>
          <span className="section-kicker">Live remote roles</span>
          <h2>Find the one that fits — in seconds</h2>
        </div>
        <div className="listing-grid">
          <aside className="filter-rail">
            <h4>Filters</h4>
            <div className="fgroup">
              <div className="ft">Category</div>
              {RAIL_CATS.map(c => {
                const n = categoryCounts[c.slug];
                return (
                  <Link key={c.slug} className="fopt" href={`/jobs?category=${c.slug}`}>
                    <span className="box"><FilterTick /></span>{c.name}
                    {n && n > 0 ? <span className="ct">{compactCount(n)}</span> : null}
                  </Link>
                );
              })}
            </div>
            <div className="fgroup">
              <div className="ft">Region</div>
              <label className="fopt on"><span className="box"><FilterTick /></span>Worldwide</label>
              <label className="fopt"><span className="box"><FilterTick /></span>Remote-first</label>
              <label className="fopt"><span className="box"><FilterTick /></span>EMEA</label>
            </div>
            <div className="fgroup">
              <div className="ft">Type</div>
              <label className="fopt on"><span className="box"><FilterTick /></span>Full-time</label>
              <label className="fopt"><span className="box"><FilterTick /></span>Contract</label>
            </div>
          </aside>

          <div className="listing-main">
            <div className="listing-head">
              <span className="lh-t"><span className="pulse" /><b>{filtered.length}</b>&nbsp;roles match</span>
              <div className="listing-search">
                <div className="search-box" role="search">
                  <svg className="s-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Filter roles…"
                    aria-label="Filter roles"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="job-list">
              {filtered.map(j => <JobRow key={j.id} job={j} />)}
            </div>
            <div style={{ textAlign: 'center', marginTop: 28 }}>
              <Link href="/jobs" className="btn btn-ghost btn-lg">Load more roles →</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
