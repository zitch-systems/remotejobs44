export function HowItWorks() {
  return (
    <section className="sec">
      <div className="wrap">
        <div className="section-head">
          <span className="section-kicker">How it works</span>
          <h2>From browse to offer letter — in three steps</h2>
        </div>
        <div className="steps-grid">
          <div className="step">
            <div className="num">01</div>
            <h3>Browse free, no card needed</h3>
            <p>Search 70,000+ remote jobs across 10 categories. Filter by role, level, salary and location — free from day one.</p>
          </div>
          <div className="step">
            <div className="num">02</div>
            <h3>Unlock access. Start applying.</h3>
            <p>Instantly unlock every apply link and email. One-click apply with your saved CV. No friction.</p>
            <div className="price-row">
              <span className="price-pill">Day Pass · $3</span>
              <span className="price-pill">Pro · $19/mo</span>
            </div>
          </div>
          <div className="step">
            <div className="num">03</div>
            <h3>Track every application</h3>
            <p>Follow each application from sent to offer in your personal dashboard. Know exactly where you stand.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
