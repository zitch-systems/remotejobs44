const FAQS = [
  {
    q: 'Is it really free to browse?',
    a: 'Yes. Browse roles and filter by category, location and date without a card. A subscription or eligible free trial may be needed to unlock an application link.',
    open: true,
  },
  {
    q: 'What do I get with a Day Pass vs Pro?',
    a: 'The ₦500 Day Pass unlocks every apply link and email for 24 hours. Pro (₦2,999/mo) adds unlimited unlocks, one-click apply with a saved CV, application tracking, and early access to featured roles.',
  },
  {
    q: 'Does remote mean I can apply from any country?',
    a: 'No. Some remote jobs only hire in certain countries. We show the location provided by the job source and flag when the hiring countries are unclear. Always confirm eligibility on the employer posting.',
  },
  {
    q: 'Can I get paid in my local currency?',
    a: 'That depends on the employer and your contract. Check the job description or ask the employer about supported currencies, payroll and your local tax requirements.',
  },
];

export function Faq() {
  return (
    <section className="sec sec--tint">
      <div className="wrap">
        <div className="section-head">
          <span className="section-kicker">Questions</span>
          <h2>Everything you need to know</h2>
        </div>
        <div className="faq-grid">
          {FAQS.map(f => (
            <details className="faq" key={f.q} open={f.open}>
              <summary>
                {f.q}
                <svg className="pm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
