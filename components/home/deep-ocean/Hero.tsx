import Link from 'next/link';
import { HeroSearch } from './HeroSearch';
import { CountUp } from './CountUp';

// Hero band (Landing B) — single column over the full-bleed photo background
// (the directional scrim lets the photo show on the right). Copy + search +
// trending chips + count-up stats + an auth CTA row. The "browser" preview
// window now lives in the LiveFeed section near the foot of the page.
export function Hero() {
  return (
    <section className="hero-b">
      <div className="wrap hb-body">
        <div className="hb-copy">
          <span className="eyebrow-pill"><span className="dot" />70,000+ live remote roles · 150+ countries hiring</span>
          <h1>The world&apos;s <em className="flip-word">remote</em> jobs.<br />One search.<br />Apply from anywhere.</h1>
          <p className="lede">
            Every remote opening worth applying to — customer service, virtual assistance, marketing,
            data &amp; software — <b>verified remote-friendly</b> and searchable in <b>one place</b>.
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

          <div className="hb-auth">
            <Link href="/login" className="btn btn-ghost btn-lg">Sign in</Link>
            <Link href="/register" className="btn btn-primary btn-lg">Sign up</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
