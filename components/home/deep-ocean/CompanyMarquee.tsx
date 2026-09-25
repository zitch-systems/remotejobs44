'use client';
import { useState } from 'react';
import { tintFor } from './helpers';

// Curated, well-known remote-friendly companies (global + African fintech).
// Brands with a `slug` have a self-hosted, brand-coloured SVG committed at
// public/logos/<slug>.svg (extracted from the simple-icons package — see
// scripts/extract-logos.mjs). Everything else renders a tinted monogram.
//
// Why self-hosted: the marquee previously hot-linked ~60 logos per page load
// from cdn.simpleicons.org + icons.duckduckgo.com — third-party requests that
// added latency, leaked visitor IPs to those CDNs, and broke whenever a CDN
// rate-limited or a brand was pulled. All requests are now same-origin static
// assets, so there are ZERO external logo requests on the homepage.
//
// (Twilio + Canva have no committed mark — both asked simple-icons to drop
// their logos — so they intentionally fall through to the monogram.)
interface Brand { name: string; slug?: string }

const COMPANIES: Brand[] = [
  { name: 'GitLab',       slug: 'gitlab'       },
  { name: 'Stripe',       slug: 'stripe'       },
  { name: 'Shopify',      slug: 'shopify'      },
  { name: 'Vercel',       slug: 'vercel'       },
  { name: 'Netlify',      slug: 'netlify'      },
  { name: 'Notion',       slug: 'notion'       },
  { name: 'Figma',        slug: 'figma'        },
  { name: 'Cloudflare',   slug: 'cloudflare'   },
  { name: 'GitHub',       slug: 'github'       },
  { name: 'Atlassian',    slug: 'atlassian'    },
  { name: 'Coinbase',     slug: 'coinbase'     },
  { name: 'Datadog',      slug: 'datadog'      },
  { name: 'MongoDB',      slug: 'mongodb'      },
  { name: 'DigitalOcean', slug: 'digitalocean' },
  { name: 'Zapier',       slug: 'zapier'       },
  { name: 'Automattic',   slug: 'automattic'   },
  { name: 'HashiCorp',    slug: 'hashicorp'    },
  { name: 'Dropbox',      slug: 'dropbox'      },
  { name: 'Linear',       slug: 'linear'       },
  { name: 'Webflow',      slug: 'webflow'      },
  { name: 'Spotify',      slug: 'spotify'      },
  { name: 'Asana',        slug: 'asana'        },
  { name: 'Grammarly',    slug: 'grammarly'    },
  { name: 'Elastic',      slug: 'elastic'      },
  { name: 'Twilio'        },
  { name: 'Canva'         },
  { name: 'Paystack'      },
  { name: 'Flutterwave'   },
  { name: 'Deel'          },
  { name: 'Remote'        },
  { name: 'Andela'        },
  { name: 'Moniepoint'    },
];

function LogoChip({ brand }: { brand: Brand }) {
  const tint = tintFor(brand.name);
  // Render the self-hosted SVG when we have one; a failed load (missing file)
  // falls back to the monogram so the marquee never shows a broken image.
  const [broken, setBroken] = useState(false);
  const showLogo = brand.slug && !broken;

  return (
    <span className="logo-chip logo-chip--logo">
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="logo-img"
          src={`/logos/${brand.slug}.svg`}
          alt={`${brand.name} logo`}
          loading="lazy"
          decoding="async"
          width={30}
          height={30}
          onError={() => setBroken(true)}
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
        Explore remote opportunities from employer boards and other sources
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
