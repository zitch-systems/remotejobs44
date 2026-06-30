import type { ReactNode } from 'react';
import Link from 'next/link';

// Shared chrome for the legal pages (Privacy, Terms, Cookies). Server
// component — the table-of-contents links are plain in-page anchors, so no
// client JS is needed. Each page supplies its own `sections`; the heading
// numbering, the "On this page" index and the related-links footer are
// generated here so the documents stay visually consistent.
export type LegalSection = {
  id: string;
  heading: string;
  body: ReactNode;
};

const RELATED = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/cookies', label: 'Cookie Policy' },
];

const two = (n: number) => String(n).padStart(2, '0');

export function LegalDoc({
  title,
  subtitle,
  updated,
  intro,
  sections,
}: {
  title: string;
  subtitle?: string;
  updated: string;
  intro?: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="bg-white dark:bg-[#0a1628]">
      {/* Header band */}
      <header className="border-b border-stone-200 dark:border-[#1e3a5f] bg-stone-50 dark:bg-[#0f1e38]">
        <div className="max-w-[820px] mx-auto px-5 py-14 sm:py-16">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 dark:text-brand-400 hover:underline mb-6"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                clipRule="evenodd"
              />
            </svg>
            Back to home
          </Link>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-stone-900 dark:text-stone-100 tracking-tight">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-3 text-md text-stone-500 dark:text-stone-400 max-w-[62ch] leading-relaxed">
              {subtitle}
            </p>
          ) : null}
          <p className="mt-4 text-sm text-stone-400 dark:text-stone-500">Last updated: {updated}</p>
        </div>
      </header>

      <div className="max-w-[820px] mx-auto px-5 py-12">
        {intro ? (
          <div className="prose prose-stone dark:prose-invert max-w-none mb-10 prose-p:text-stone-600 dark:prose-p:text-stone-300 prose-a:text-brand-700 dark:prose-a:text-brand-400">
            {intro}
          </div>
        ) : null}

        {/* Table of contents */}
        <nav
          aria-label="Table of contents"
          className="mb-12 rounded-2xl border border-stone-200 dark:border-[#1e3a5f] bg-stone-50/70 dark:bg-[#0f1e38]/60 p-5 sm:p-6"
        >
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">
            On this page
          </h2>
          <ol className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5 list-none m-0 p-0">
            {sections.map((s, i) => (
              <li key={s.id} className="m-0 p-0">
                <a
                  href={`#${s.id}`}
                  className="group flex gap-2.5 text-sm text-stone-600 dark:text-stone-300 hover:text-brand-700 dark:hover:text-brand-400 no-underline"
                >
                  <span className="tabular-nums text-stone-300 dark:text-stone-600 group-hover:text-brand-500">
                    {two(i + 1)}
                  </span>
                  <span>{s.heading}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <div className="space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-28">
              <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-3">
                <span className="text-brand-600/60 dark:text-brand-400/50 mr-2 tabular-nums">{two(i + 1)}</span>
                {s.heading}
              </h2>
              <div className="prose prose-stone dark:prose-invert max-w-none leading-relaxed prose-p:text-stone-600 dark:prose-p:text-stone-300 prose-li:text-stone-600 dark:prose-li:text-stone-300 prose-strong:text-stone-900 dark:prose-strong:text-stone-100 prose-a:text-brand-700 dark:prose-a:text-brand-400">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        {/* Related documents + contact */}
        <div className="mt-16 pt-8 border-t border-stone-200 dark:border-[#1e3a5f] flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-stone-400 dark:text-stone-500">Related:</span>
          {RELATED.filter((r) => r.label.toLowerCase() !== title.toLowerCase()).map((r) => (
            <Link key={r.href} href={r.href} className="text-brand-700 dark:text-brand-400 hover:underline">
              {r.label}
            </Link>
          ))}
          <a href="mailto:hello@remotejobs44.com" className="text-brand-700 dark:text-brand-400 hover:underline">
            Contact us
          </a>
        </div>
      </div>
    </div>
  );
}
