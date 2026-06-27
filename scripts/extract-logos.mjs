// scripts/extract-logos.mjs
//
// One-off / refresh generator for the self-hosted company logos used by the
// homepage marquee (components/home/deep-ocean/CompanyMarquee.tsx).
//
// It reads each brand mark from the `simple-icons` package (a devDependency)
// and writes a brand-coloured SVG to public/logos/<slug>.svg. The committed
// SVGs are what ship — this script is only needed to add a new brand or
// refresh an existing mark. Run with:
//
//   node scripts/extract-logos.mjs
//
// Brands without a simple-icons mark (e.g. Twilio, Canva, and the African
// fintechs) are intentionally omitted here and render as monograms in the
// component.
import * as si from 'simple-icons';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'logos');

const SLUGS = [
  'gitlab', 'stripe', 'shopify', 'vercel', 'netlify', 'notion', 'figma',
  'cloudflare', 'github', 'atlassian', 'coinbase', 'datadog', 'mongodb',
  'digitalocean', 'zapier', 'automattic', 'hashicorp', 'dropbox', 'linear',
  'webflow', 'spotify', 'asana', 'grammarly', 'elastic',
];

mkdirSync(OUT, { recursive: true });

const all = Object.values(si);
const missing = [];
let written = 0;
for (const slug of SLUGS) {
  const icon = all.find((v) => v && v.slug === slug);
  if (!icon) { missing.push(slug); continue; }
  // simple-icons ships a monochrome path; paint it in the brand hex so the
  // marquee shows full-colour marks.
  const svg = icon.svg.replace('<svg ', `<svg fill="#${icon.hex}" `);
  writeFileSync(join(OUT, `${slug}.svg`), svg);
  written++;
}

console.log(`extract-logos: wrote ${written} logos to public/logos`);
if (missing.length) console.warn(`extract-logos: no simple-icons mark for: ${missing.join(', ')}`);
