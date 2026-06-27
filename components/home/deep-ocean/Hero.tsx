import Link from 'next/link';
import { HeroSearch } from './HeroSearch';
import { CountUp } from './CountUp';
import { LandingJob, payCompact, tintFor } from './data';

// Hero band — starts directly (no <header>, the app layout renders that).
// Photo background + live-preview window + count-up stats.
export function Hero({ jobs }: { jobs: LandingJob[] }) {
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
    <section className="hero-b">
      <div className="wrap hb-body">
        <div className="hb-copy">
          <span className="eyebrow-pill"><span className="dot" />70,000+ live remote roles · 150+ countries hiring</span>
          <h1>The world&apos;s <em className="flip-word">remote</em> jobs.<br />One search.<br />Apply from anywhere.</h1>
          <p className="lede">
            Every remote opening worth applying to — engineering, design, marketing, finance, data —{' '}
            <b>verified remote-friendly</b> and searchable in <b>one place</b>.
          </p>

          <HeroSearch />

          <div className="hb-stats">
            <div className="hb-stat">
              <CountUp className="n" target={70} suffix="k+" loop holdMs={2600} />
              <div className="l">Jobs indexed</div>
            </div>
            <div className="hb-stat">
              <CountUp className="n" target={150} suffix="+" loop holdMs={3000} />
              <div className="l">Countries hiring</div>
            </div>
            <div className="hb-stat">
              <CountUp className="n" target={10} suffix="+" loop holdMs={3400} />
              <div className="l">Job categories</div>
            </div>
          </div>
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
                {preview.map(j => <PreviewRow key={`a-${j.id}`} job={j} />)}
                {preview.map(j => <PreviewRow key={`b-${j.id}`} job={j} />)}
              </div>
            </div>
          </div>
          <figure className="hero-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/redesign/ig-high-five.jpg" alt="Two remote teammates celebrating an offer" />
            <figcaption><span className="hp-pulse" />Hired remotely this week</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
