import Link from 'next/link';
import { LandingJob, payCompact, ageLabel, tintFor } from './data';
import { CompanyMask } from '@/components/jobs/CompanyMask';

// Live market wall — 4 columns of vertically-scrolling cards (CSS animated).
// Each track's children are rendered TWICE so the -50% translate loops
// seamlessly. Cards link to /jobs/[id].
function LwCard({ job }: { job: LandingJob }) {
  const tint = tintFor(job.company);
  return (
    <Link href={`/jobs/${job.id}`} className="lw-card">
      <div className="lw-top">
        <span className="job-logo" style={{ ['--lm-bg' as string]: tint.bg, ['--lm-fg' as string]: tint.fg }}>
          {job.logo}
        </span>
        <span className="lw-pay">{payCompact(job)}</span>
      </div>
      <div className="lw-title">{job.title}</div>
      <div className="lw-co"><CompanyMask company={job.company} /> · {job.location}</div>
      <div className="lw-foot">
        <span className="lw-live"><i />Live</span>
        <span className="lw-age">{ageLabel(job)}</span>
      </div>
    </Link>
  );
}

function distribute(jobs: LandingJob[], cols: number): LandingJob[][] {
  const out: LandingJob[][] = Array.from({ length: cols }, () => []);
  jobs.forEach((j, i) => out[i % cols].push(j));
  // Ensure each column has at least a couple cards for a believable loop.
  return out.map(col => (col.length ? col : jobs.slice(0, 3)));
}

export function LiveWall({ jobs }: { jobs: LandingJob[] }) {
  // No jobs → render nothing rather than an empty scrolling stage (a large
  // blank band). Mirrors Featured's guard so a data gap degrades cleanly.
  if (jobs.length === 0) return null;

  const cols = distribute(jobs.slice(0, 24), 4);

  return (
    <section className="livewall">
      <div className="lw-head">
        <span className="lw-kicker"><span className="lw-dot" />Live market</span>
        <h2>Thousands of roles, moving in real time</h2>
        <p>New remote jobs land every minute, across every timezone. Here&apos;s the market right now.</p>
      </div>
      <div className="lw-stage">
        {cols.map((col, ci) => (
          <div className="lw-col" key={ci}>
            <div className="lw-track">
              {col.map((j, i) => <LwCard key={`a-${ci}-${j.id}-${i}`} job={j} />)}
              {col.map((j, i) => <LwCard key={`b-${ci}-${j.id}-${i}`} job={j} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
