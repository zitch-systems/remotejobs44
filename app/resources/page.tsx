// app/resources/page.tsx — Career resources hub.
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Sparkles, Brain, FileText, Globe2 } from 'lucide-react';
import { ARTICLES } from '@/lib/resources';

const BASE = 'https://remotejobs44.com';

export const metadata: Metadata = {
  title: 'Career Resources — Remote Work Guides for Africa',
  description: 'Honest guides for landing and keeping a remote job from Africa: salary benchmarks, CV templates, interview prep, country playbooks, and more.',
  alternates: { canonical: `${BASE}/resources` },
  openGraph: {
    title: 'Remote Career Resources for African Workers',
    description: 'In-depth guides on salaries, CV writing, interview prep, and country-specific remote-job strategies.',
    url: `${BASE}/resources`,
    type: 'website',
  },
};

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  'getting-started': { label: 'Getting Started',  icon: <Sparkles className="w-4 h-4" /> },
  'salary':          { label: 'Salary',           icon: <BookOpen className="w-4 h-4" /> },
  'tools':           { label: 'Tools',            icon: <BookOpen className="w-4 h-4" /> },
  'country-guide':   { label: 'Country Guides',   icon: <Globe2 className="w-4 h-4" /> },
  'interview':       { label: 'Interview',        icon: <Brain className="w-4 h-4" /> },
  'cv':              { label: 'CV & Cover Letter',icon: <FileText className="w-4 h-4" /> },
  'remote-life':     { label: 'Remote Life',      icon: <BookOpen className="w-4 h-4" /> },
  'skills':          { label: 'Skills & Roadmaps',icon: <BookOpen className="w-4 h-4" /> },
};

export default function ResourcesPage() {
  const grouped: Record<string, typeof ARTICLES> = {};
  for (const a of ARTICLES) {
    (grouped[a.category] ||= []).push(a);
  }

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-10">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
          <BookOpen className="w-3.5 h-3.5" /> Career Resources
        </div>
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
          Remote Work Guides for African Talent
        </h1>
        <p className="text-stone-500 dark:text-stone-400 mt-3 max-w-2xl mx-auto leading-relaxed">
          {ARTICLES.length} in-depth, no-fluff articles on landing remote work, growing your career, and getting paid in USD from Africa. Updated regularly.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
          <Link href="/interview-prep" className="inline-flex items-center gap-2 px-4 py-2 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
            <Brain className="w-4 h-4" /> AI Interview Prep
          </Link>
          <Link href="/profile" className="inline-flex items-center gap-2 px-4 py-2 border border-stone-200 dark:border-[#1e3a5f] text-stone-700 dark:text-stone-300 text-sm font-bold rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            <FileText className="w-4 h-4" /> AI CV Review
          </Link>
        </div>
      </div>

      {Object.entries(grouped).map(([cat, articles]) => {
        const meta = CATEGORY_LABELS[cat];
        return (
          <section key={cat} className="mb-10">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400 mb-4">
              <span className="text-brand-600">{meta?.icon}</span> {meta?.label}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {articles.map(a => (
                <Link key={a.slug} href={`/resources/${a.slug}`} className="card p-5 hover:border-brand-600 dark:hover:border-brand-500 hover:-translate-y-0.5 transition-all group">
                  <p className="text-xs text-stone-400 dark:text-stone-500 mb-2">{a.readMinutes} min read</p>
                  <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors line-clamp-2 mb-2">{a.title}</h3>
                  <p className="text-sm text-stone-500 dark:text-stone-400 line-clamp-2 mb-3">{a.description}</p>
                  <span className="inline-flex items-center gap-1 text-xs text-brand-700 dark:text-brand-400 font-bold">
                    Read guide <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
