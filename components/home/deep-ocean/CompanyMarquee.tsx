'use client';
import { useState } from 'react';
import { tintFor } from './helpers';

// Curated, well-known remote-friendly companies (global + African fintech).
// Each carries a Simple Icons slug where one exists and a domain for the
// DuckDuckGo favicon fallback. Logos render in full brand colour; a tinted
// monogram is the last-resort fallback. Slugs/domains mirror the design
// handoff's BRAND_SLUG / BRAND_DOMAIN maps.
//
// NOTE (production): these are hot-linked from public icon CDNs (Simple Icons
// / DuckDuckGo). Before a full public launch, prefer self-hosting approved
// partner marks / a licensed logo API and confirm usage rights per brand.
interface Brand { name: string; slug?: string; domain: string }

const COMPANIES: Brand[] = [
  { name: 'GitLab',       slug: 'gitlab',       domain: 'gitlab.com' },
  { name: 'Stripe',       slug: 'stripe',       domain: 'stripe.com' },
  { name: 'Shopify',      slug: 'shopify',      domain: 'shopify.com' },
  { name: 'Vercel',       slug: 'vercel',       domain: 'vercel.com' },
  { name: 'Netlify',      slug: 'netlify',      domain: 'netlify.com' },
  { name: 'Notion',       slug: 'notion',       domain: 'notion.so' },
  { name: 'Figma',        slug: 'figma',        domain: 'figma.com' },
  { name: 'Cloudflare',   slug: 'cloudflare',   domain: 'cloudflare.com' },
  { name: 'GitHub',       slug: 'github',       domain: 'github.com' },
  { name: 'Atlassian',    slug: 'atlassian',    domain: 'atlassian.com' },
  { name: 'Coinbase',     slug: 'coinbase',     domain: 'coinbase.com' },
  { name: 'Datadog',      slug: 'datadog',      domain: 'datadoghq.com' },
  { name: 'MongoDB',      slug: 'mongodb',      domain: 'mongodb.com' },
  { name: 'DigitalOcean', slug: 'digitalocean', domain: 'digitalocean.com' },
  { name: 'Zapier',       slug: 'zapier',       domain: 'zapier.com' },
  { name: 'Automattic',   slug: 'automattic',   domain: 'automattic.com' },
  { name: 'HashiCorp',    slug: 'hashicorp',    domain: 'hashicorp.com' },
  { name: 'Twilio',       slug: 'twilio',       domain: 'twilio.com' },
  { name: 'Dropbox',      slug: 'dropbox',      domain: 'dropbox.com' },
  { name: 'Linear',       slug: 'linear',       domain: 'linear.app' },
  { name: 'Webflow',      slug: 'webflow',      domain: 'webflow.com' },
  { name: 'Spotify',      slug: 'spotify',      domain: 'spotify.com' },
  { name: 'Asana',        slug: 'asana',        domain: 'asana.com' },
  { name: 'Grammarly',    slug: 'grammarly',    domain: 'grammarly.com' },
  { name: 'Elastic',      slug: 'elastic',      domain: 'elastic.co' },
  { name: 'Canva',        slug: 'canva',        domain: 'canva.com' },
  { name: 'Paystack',                           domain: 'paystack.com' },
  { name: 'Flutterwave',                        domain: 'flutterwave.com' },
  { name: 'Deel',                               domain: 'deel.com' },
  { name: 'Remote',                             domain: 'remote.com' },
  { name: 'Andela',                             domain: 'andela.com' },
  { name: 'Moniepoint',                         domain: 'moniepoint.com' },
];

function LogoChip({ brand }: { brand: Brand }) {
  // Source chain: Simple Icons (crisp brand-coloured vector) → DuckDuckGo
  // favicon (covers brands not on Simple Icons) → tinted monogram.
  const sources: string[] = [];
  if (brand.slug) sources.push(`https://cdn.simpleicons.org/${brand.slug}`);
  sources.push(`https://icons.duckduckgo.com/ip3/${brand.domain}.ico`);

  const [idx, setIdx] = useState(0);
  const tint = tintFor(brand.name);

  return (
    <span className="logo-chip logo-chip--logo">
      {idx < sources.length ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="logo-img"
          src={sources[idx]}
          alt={`${brand.name} logo`}
          loading="lazy"
          decoding="async"
          width={30}
          height={30}
          onError={() => setIdx(i => i + 1)}
        />
      ) : (
        <span className="logo-mark" style={{ ['--lm-bg' as string]: tint.bg, ['--lm-fg' as string]: tint.fg }}>
          {brand.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="logo-name">{brand.name}</span>
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
          {/* duplicated track for a seamless CSS loop (translates -50%) */}
          <div className="marquee-track">
            {[...rowA, ...rowA].map((b, i) => <LogoChip key={`a-${b.name}-${i}`} brand={b} />)}
          </div>
        </div>
        <div className="marquee-row">
          <div className="marquee-track marquee-track--rev">
            {[...rowB, ...rowB].map((b, i) => <LogoChip key={`b-${b.name}-${i}`} brand={b} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
