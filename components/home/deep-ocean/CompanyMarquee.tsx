import { tintFor } from './data';

// Curated, well-known remote-friendly companies. Monogram chips only —
// we deliberately do NOT hot-link external logo CDNs.
const COMPANIES = [
  'GitLab', 'Automattic', 'Zapier', 'Stripe', 'Shopify', 'Vercel',
  'Deel', 'Remote', 'Figma', 'Notion', 'Coinbase', 'Cloudflare',
  'Datadog', 'HashiCorp', 'Twilio', 'Atlassian', 'Doist', 'Buffer',
];

function Chip({ name }: { name: string }) {
  const tint = tintFor(name);
  const mark = name.slice(0, 2).toUpperCase();
  return (
    <span className="logo-chip">
      <span className="logo-mark" style={{ ['--lm-bg' as string]: tint.bg, ['--lm-fg' as string]: tint.fg }}>
        {mark}
      </span>
      <span className="logo-name">{name}</span>
    </span>
  );
}

export function CompanyMarquee() {
  const half = Math.ceil(COMPANIES.length / 2);
  const rowA = COMPANIES.slice(0, half);
  const rowB = COMPANIES.slice(half);

  return (
    <section className="band">
      <div className="band-label">
        70,000+ roles from the companies defining remote work — indexed in one place
      </div>
      <div className="marquee">
        <div className="marquee-row">
          <div className="marquee-track">
            {[...rowA, ...rowA].map((n, i) => <Chip key={`a-${n}-${i}`} name={n} />)}
          </div>
        </div>
        <div className="marquee-row">
          <div className="marquee-track marquee-track--rev">
            {[...rowB, ...rowB].map((n, i) => <Chip key={`b-${n}-${i}`} name={n} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
