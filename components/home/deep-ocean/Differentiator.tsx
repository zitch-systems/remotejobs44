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
          <h2>Find the details that matter before you apply</h2>
          <p>Remote roles may still have country restrictions. Review the listed location and source alongside each opening.</p>
        </div>
        <div className="diff-grid">
          <div className="diff-card">
            <span className="dnum">01 · LOCATION</span>
            <h3>See where the role is listed</h3>
            <p>We show the location from the job feed and flag when hiring countries are not stated. Confirm eligibility with the employer.</p>
            <div className="diff-mock">
              <div className="mock-row"><Tick />Employer-listed <b>location</b></div>
              <div className="mock-row"><Tick />Unspecified countries <b>flagged</b></div>
            </div>
          </div>
          <div className="diff-card">
            <span className="dnum">02 · TRANSPARENT</span>
            <h3>Salary when published</h3>
            <p>See a salary range when the source provides one. You can filter jobs by published pay.</p>
            <div className="diff-mock">
              <div className="mock-row"><b>$90k</b>&nbsp;—&nbsp;<b>$130k</b>&nbsp;<span style={{ color: 'var(--fg-4)' }}>/ yr</span></div>
              <div className="mock-bar"><i style={{ width: '72%' }} /></div>
              <div className="mock-row" style={{ color: 'var(--fg-4)' }}>Median for Senior · Remote</div>
            </div>
          </div>
          <div className="diff-card">
            <span className="dnum">03 · FAST</span>
            <h3>Follow the application route</h3>
            <p>Review the role here, then open the available application link when you are ready to apply.</p>
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
