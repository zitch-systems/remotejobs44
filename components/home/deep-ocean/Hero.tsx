import Link from 'next/link';
import { HeroSearch } from './HeroSearch';

// Hero band (Landing B) — single column over the full-bleed photo background
// (the directional scrim lets the photo show on the right). Copy + search +
// trending chips + count-up stats + an auth CTA row. The "browser" preview
// window now lives in the LiveFeed section near the foot of the page.
export function Hero() {
  return (
    <section className="hero-b">
      <div className="wrap hb-body">
        <div className="hb-copy">
          <span className="eyebrow-pill"><span className="dot" />Employer boards and external job feeds</span>
          <h1>Find <em className="flip-word">remote</em> jobs.<br />Check the location.<br />Apply with confidence.</h1>
          <p className="lede">
            Explore roles across customer service, marketing, data and software.
            See the <b>listed location and source</b> before deciding where to apply.
          </p>

          <HeroSearch />

          <div className="hb-stats">
            <div className="hb-stat">
              <span className="n">01</span>
              <div className="l">Search roles</div>
            </div>
            <div className="hb-stat">
              <span className="n">02</span>
              <div className="l">Review locations</div>
            </div>
            <div className="hb-stat">
              <span className="n">03</span>
              <div className="l">Apply and track</div>
            </div>
          </div>

          <div className="hb-auth">
            <Link href="/login" className="btn btn-ghost btn-lg">Sign in</Link>
            <Link href="/register" className="btn btn-primary btn-lg">Sign up</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
