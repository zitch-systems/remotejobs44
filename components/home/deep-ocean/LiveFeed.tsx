// app/page.tsx landing — "Live feed" section: the browser-style preview window
// whose job rows auto-scroll, plus the floating "Hired remotely this week" photo
// card. In the new Landing B layout the hero is single-column, so this preview
// moved out of the hero into its own section near the foot of the page.
import Link from 'next/link';
import Image from 'next/image';
import { LandingJob, payCompact, tintFor } from './data';

export function LiveFeed({ jobs }: { jobs: LandingJob[] }) {
  const preview = jobs.slice(0, 8);

  const PreviewRow = ({ job }: { job: LandingJob }) => {
    const tint = tintFor(job.company);
    return (
      <Link href={`/jobs/${job.id}`} className="prow">
        <span className="job-logo" style={{ ['--lm-bg' as string]: tint.bg, ['--lm-fg' as string]: tint.fg }}>
          {job.logo}
        </span>
        <span>
          <div className="pt">{job.title}</div>
          <div className="pm">{job.company} · {job.location}</div>
        </span>
        <span className="pp">{payCompact(job)}</span>
      </Link>
    );
  };

  return (
    <section className="sec">
      <div className="wrap live-feed-wrap">
        <div className="section-head">
          <span className="section-kicker">Live right now</span>
          <h2>Fresh remote roles, posted every minute</h2>
          <p>A live look at what&apos;s going up on RemoteJobs44 as you read this.</p>
        </div>

        <div className="preview-wrap">
          <div className="preview">
            <div className="preview-bar">
              <div className="dots">
                <i style={{ background: '#ff5f57' }} />
                <i style={{ background: '#febc2e' }} />
                <i style={{ background: '#28c840' }} />
              </div>
              <div className="preview-url">remotejobs44.com/jobs <span className="live"><i />Live</span></div>
            </div>
            <div className="preview-search">
              <div className="pbox">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <span>Remote · Worldwide · All categories</span>
              </div>
            </div>
            <div className="preview-viewport">
              <div className="preview-track">
                {preview.map((j) => <PreviewRow key={`a-${j.id}`} job={j} />)}
                {preview.map((j) => <PreviewRow key={`b-${j.id}`} job={j} />)}
              </div>
            </div>
          </div>
          <figure className="hero-photo">
            <Image
              src="/redesign/ig-high-five.jpg"
              alt="Two remote teammates celebrating an offer"
              width={172}
              height={204}
              sizes="172px"
            />
            <figcaption><span className="hp-pulse" />Hired remotely this week</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
