import Link from 'next/link';
import { ReactNode } from 'react';

// Browse-by-category grid. Each tile links to /jobs/category/<slug>
// (slugs from lib/seo-slices.ts). --cat-bg / --cat-fg set inline per tile.
// Counts come live from fetchCategoryCounts (keyed by the same slug, which
// equals the DB `category` value); falls back to a generic label when a
// count is unavailable so we never render "0 open roles" from a query miss.
interface Cat {
  slug: string;
  name: string;
  bg: string;
  fg: string;
  icon: ReactNode;
}

// Exported so the page fetches every count in one place and shares the map
// with the listings filter rail.
export const CATEGORY_SLUGS = ['engineering', 'design', 'marketing', 'data', 'finance', 'operations', 'hr', 'sales'];

const CATS: Cat[] = [
  {
    slug: 'engineering', name: 'Engineering', bg: '#eff6ff', fg: '#2563eb',
    icon: <><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>,
  },
  {
    slug: 'design', name: 'Design', bg: '#faf5ff', fg: '#9333ea',
    icon: <><circle cx="13.5" cy="6.5" r="2.5" /><circle cx="6.5" cy="12.5" r="2.5" /><circle cx="17" cy="17" r="2.5" /><path d="M12 9l-3 2M15 15l-1-3" /></>,
  },
  {
    slug: 'marketing', name: 'Marketing', bg: '#fdf2f8', fg: '#db2777',
    icon: <><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
  },
  {
    slug: 'data', name: 'Data & AI', bg: '#ecfeff', fg: '#0891b2',
    icon: <><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>,
  },
  {
    slug: 'finance', name: 'Finance', bg: '#fffbeb', fg: '#d97706',
    icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  },
  {
    slug: 'operations', name: 'Customer Support', bg: '#fff7ed', fg: '#ea580c',
    icon: <><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></>,
  },
  {
    slug: 'hr', name: 'People & HR', bg: '#eef2ff', fg: '#4f46e5',
    icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  },
  {
    slug: 'sales', name: 'Sales', bg: '#fff1f2', fg: '#e11d48',
    icon: <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>,
  },
];

export function Categories({ counts = {} }: { counts?: Record<string, number> }) {
  return (
    <section className="sec sec--tint">
      <div className="wrap">
        <div className="section-head">
          <span className="section-kicker">Browse by category</span>
          <h2>Wherever your skills are, there&apos;s a remote role</h2>
          <p>10+ categories, updated daily. Pick a lane and jump straight into live openings.</p>
        </div>
        <div className="cat-grid">
          {CATS.map(c => {
            const n = counts[c.slug];
            return (
              <Link
                key={c.slug}
                className="cat-tile"
                href={`/jobs/category/${c.slug}`}
                style={{ ['--cat-bg' as string]: c.bg, ['--cat-fg' as string]: c.fg }}
              >
                <span className="ci">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    {c.icon}
                  </svg>
                </span>
                <span className="cn">{c.name}</span>
                <span className="cc">
                  {n && n > 0
                    ? <><b>{n.toLocaleString()}</b> open {n === 1 ? 'role' : 'roles'}</>
                    : 'Browse open roles'}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
