import Link from 'next/link';
import { LandingJob, payLabel, ageLabel, tintFor } from './data';
import { CompanyMask } from '@/components/jobs/CompanyMask';

// Featured cards (fcard-grid) from real data. Prefers featured rows;
// the data fetch already orders featured-first so the first 6 are the
// most prominent. Each card links to /jobs/[id].
export function Featured({ jobs }: { jobs: LandingJob[] }) {
  const cards = jobs.slice(0, 6);
  if (cards.length === 0) return null;

  return (
    <section className="sec">
      <div className="wrap">
        <div className="section-head">
          <span className="section-kicker">Featured this week</span>
          <h2>Roles our team is excited about</h2>
          <p>Verified companies, transparent pay, direct apply links.</p>
        </div>
        <div className="fcard-grid">
          {cards.map(job => {
            const tint = tintFor(job.company);
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className={`fcard${job.featured ? ' fcard--featured' : ''}`}>
                <div className="fcard-top">
                  <span className="job-logo" style={{ ['--lm-bg' as string]: tint.bg, ['--lm-fg' as string]: tint.fg }}>
                    {job.logo}
                  </span>
                </div>
                <h3 className="fcard-title">{job.title}</h3>
                <p className="fcard-co"><CompanyMask company={job.company} /> · {job.location}</p>
                <div className="fcard-tags">
                  <span className="fcard-type">
                    {job.type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-')}
                  </span>
                </div>
                <div className="fcard-foot">
                  <span className="fcard-pay">{payLabel(job)}</span>
                  <span className="fcard-age">{ageLabel(job)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
