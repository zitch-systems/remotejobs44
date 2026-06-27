const FAQS = [
  {
    q: 'Is it really free to browse?',
    a: 'Yes. Search all 70,000+ roles, filter by category, salary and region, and save jobs — no card required. You only pay when you’re ready to unlock apply links and contact details.',
    open: true,
  },
  {
    q: 'What do I get with a Day Pass vs Pro?',
    a: 'The $3 Day Pass unlocks every apply link and email for 24 hours. Pro ($19/mo) adds unlimited unlocks, one-click apply with a saved CV, application tracking, and early access to featured roles.',
  },
  {
    q: 'How do you verify the jobs are really remote?',
    a: 'Every listing is checked against the company’s stated remote policy and hiring locations before it goes live. Roles that secretly require on-site work or one specific country are filtered out — what you see is what actually hires remotely.',
  },
  {
    q: 'Can I get paid in my local currency?',
    a: 'Most listed companies pay through global payroll partners like Deel, Remote and Wise, so you can receive USD, EUR or GBP, or convert to your local currency. Each listing notes the payment method where known.',
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
