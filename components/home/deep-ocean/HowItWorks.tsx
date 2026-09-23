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
            <p>Search roles by title, category and location. Read the listed country requirements before applying.</p>
          </div>
          <div className="step">
            <div className="num">02</div>
            <h3>Unlock access. Start applying.</h3>
            <p>Unlock the available application link, then follow the employer&apos;s process for that role.</p>
            <div className="price-row">
              <span className="price-pill">Day Pass · ₦500</span>
              <span className="price-pill">Pro · ₦2,999/mo</span>
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
