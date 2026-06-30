// app/page.tsx landing — Pricing section ("Apply free. Pay only to unlock.").
// Three tiers (Free / Day Pass / Pro); Pro is the highlighted "Most popular".
// All CTAs route to /register; the real plan selection lives on /pricing.
import Link from 'next/link';

type Tier = {
  name: string;
  price: string;
  per: string;
  tag: string;
  features: string[];
  cta: string;
  primary?: boolean;
  pop?: boolean;
};

const TIERS: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    per: 'forever',
    tag: 'Find, track and get alerted to roles.',
    features: [
      'Browse 70,000+ verified remote roles',
      'Daily job alerts & saved searches',
      'Filter by role, level & region',
    ],
    cta: 'Create free account',
  },
  {
    name: 'Day Pass',
    price: '$3',
    per: '/ 24 hours',
    tag: 'Just need to fire off one application.',
    features: [
      'Unlock every apply link & email',
      'Apply directly to any role for 24 hours',
      'No subscription, no auto-renew',
    ],
    cta: 'Get a Day Pass',
  },
  {
    name: 'Pro',
    price: '$19',
    per: '/ month',
    tag: 'Unlimited applying, every day.',
    features: [
      'Unlimited apply-link unlocks',
      'Save your CV to apply faster',
      'Application tracker',
      'Early access to featured roles',
    ],
    cta: 'Go Pro',
    primary: true,
    pop: true,
  },
];

export function Pricing() {
  return (
    <section className="sec sec--tint" id="pricing">
      <div className="wrap">
        <div className="section-head">
          <span className="section-kicker">Simple pricing</span>
          <h2>Apply free. Pay only to unlock.</h2>
          <p>
            Browsing, job alerts and saved searches are free forever — upgrade only when
            you&apos;re ready to hit apply.
          </p>
        </div>
        <div className="price-grid">
          {TIERS.map((t) => (
            <div key={t.name} className={`ptier${t.pop ? ' ptier--pop' : ''}`}>
              {t.pop ? <span className="pt-badge">Most popular</span> : null}
              <div className="pt-name">{t.name}</div>
              <div className="pt-price">
                <b>{t.price}</b>
                <span>{t.per}</span>
              </div>
              <p className="pt-tag">{t.tag}</p>
              <ul className="pt-list">
                {t.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link href="/register" className={`btn ${t.primary ? 'btn-primary' : 'btn-ghost'} btn-lg pt-cta`}>
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
