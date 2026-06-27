// Static 3-up differentiator with mini UI mocks. No data/interactivity.
function Tick() {
  return (
    <span className="tick">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
}

export function Differentiator() {
  return (
    <section className="sec sec--tint">
      <div className="wrap">
        <div className="section-head">
          <span className="section-kicker">How we&apos;re different</span>
          <h2>Three checks every listing passes</h2>
          <p>Most boards quietly bury roles that secretly want you on-site. Here, every job clears the same bar before it goes live.</p>
        </div>
        <div className="diff-grid">
          <div className="diff-card">
            <span className="dnum">01 · VERIFIED</span>
            <h3>Confirmed fully remote</h3>
            <p>We check each employer&apos;s location policy. Roles that secretly need relocation or a single country never make the list.</p>
            <div className="diff-mock">
              <div className="mock-row"><Tick />Hires in <b>any timezone</b></div>
              <div className="mock-row"><Tick />Global payroll via <b>Deel · Remote</b></div>
            </div>
          </div>
          <div className="diff-card">
            <span className="dnum">02 · TRANSPARENT</span>
            <h3>Salary shown upfront</h3>
            <p>Every listing carries a real pay range in USD — no &ldquo;competitive salary&rdquo;, no guessing before you apply.</p>
            <div className="diff-mock">
              <div className="mock-row"><b>$90k</b>&nbsp;—&nbsp;<b>$130k</b>&nbsp;<span style={{ color: 'var(--fg-4)' }}>/ yr</span></div>
              <div className="mock-bar"><i style={{ width: '72%' }} /></div>
              <div className="mock-row" style={{ color: 'var(--fg-4)' }}>Median for Senior · Remote</div>
            </div>
          </div>
          <div className="diff-card">
            <span className="dnum">03 · FAST</span>
            <h3>Apply in one click</h3>
            <p>Unlock the direct apply link and send your saved CV in seconds. No re-typing, no dead &ldquo;apply on company site&rdquo; loops.</p>
            <div className="diff-mock">
              <div className="mock-row"><Tick />CV attached · <b>ada-cv.pdf</b></div>
              <div className="mock-row mock-apply"><span>Direct apply link</span><span className="mbtn">Apply →</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
