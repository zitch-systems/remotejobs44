// mobile/scripts/gen-icons.mjs — regenerate the app icon + splash + favicon
// from the RemoteJobs44 brand mark (blue tile + chart-line + orange dot).
//
// Uses `sharp` resolved from the repo ROOT node_modules (it's a web devtool;
// node walks up from this file and finds it). Run from anywhere:
//   node mobile/scripts/gen-icons.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../assets/images/', import.meta.url));

// The logo mark, matching the web Header svg.
const glyph = `
  <path d="M8 27 Q15 11 21 20 Q26 27 31 13" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>
  <circle cx="31" cy="13" r="3.4" fill="#f97316"/>`;

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 40 40">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs>
  <rect width="40" height="40" fill="url(#g)"/>${glyph}</svg>`;

// transparent glyph, padded for the splash + Android adaptive safe-zone
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-4 -4 48 48">${glyph}</svg>`;
const fgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-13 -13 66 66">${glyph}</svg>`;

const png = (svg) => sharp(Buffer.from(svg)).png();

await png(iconSvg).toFile(OUT + 'icon.png');
await png(splashSvg).toFile(OUT + 'splash-icon.png');
await png(fgSvg).toFile(OUT + 'android-icon-foreground.png');
await png(iconSvg).resize(48, 48).toFile(OUT + 'favicon.png');
console.log('Regenerated icon / splash / favicon in', OUT);
