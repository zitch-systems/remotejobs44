// app/resources/[slug]/page.tsx — Per-article page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Clock, Calendar } from 'lucide-react';
import { ARTICLES, findArticle } from '@/lib/resources';

const BASE = 'https://remotejobs44.com';

export function generateStaticParams() {
  return ARTICLES.map(a => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = findArticle(params.slug);
  if (!a) return {};
  const url = `${BASE}/resources/${a.slug}`;
  return {
    title: `${a.title} | RemoteJobs44`,
    description: a.description,
    alternates: { canonical: url },
    openGraph: { title: a.title, description: a.description, url, type: 'article' },
    twitter: { card: 'summary_large_image', title: a.title, description: a.description },
  };
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const a = findArticle(params.slug);
  if (!a) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    datePublished: a.updated,
    dateModified: a.updated,
    author: { '@type': 'Organization', name: 'RemoteJobs44' },
    publisher: { '@type': 'Organization', name: 'RemoteJobs44', url: BASE },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE}/resources/${a.slug}` },
  };

  return (
    <div className="max-w-[760px] mx-auto px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/resources" className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 dark:text-brand-400 hover:underline mb-5">
        <ArrowLeft className="w-3 h-3" /> All resources
      </Link>

      <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight leading-tight mb-3">{a.title}</h1>
      <p className="text-stone-500 dark:text-stone-400 leading-relaxed mb-4">{a.description}</p>
      <div className="flex items-center gap-3 text-xs text-stone-400 dark:text-stone-500 mb-8">
        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {a.readMinutes} min read</span>
        <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> Updated {new Date(a.updated).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
      </div>

      <article className="space-y-7 prose prose-stone dark:prose-invert max-w-none">
        {a.sections.map((s, i) => (
          <section key={i}>
            <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2 mt-0">{s.heading}</h2>
            <p className="text-stone-600 dark:text-stone-300 leading-relaxed">{s.body}</p>
          </section>
        ))}
      </article>

      <div className="mt-10 card p-6 bg-brand-50 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800">
        <h3 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">Ready to apply?</h3>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">Browse 50,000+ verified remote jobs. Apply from ₦500 with a Day Pass.</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/jobs" className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
            Browse jobs <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/interview-prep" className="inline-flex items-center gap-2 px-5 py-2.5 border border-stone-200 dark:border-[#1e3a5f] text-stone-700 dark:text-stone-300 text-sm font-bold rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            AI Interview Prep
          </Link>
        </div>
      </div>
    </div>
  );
}
