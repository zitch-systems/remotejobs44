// app/resources/[slug]/page.tsx — Per-article page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Clock, Calendar } from 'lucide-react';
import { ARTICLES, findArticle } from '@/lib/resources';
import { ArticleJsonLd } from '@/components/seo/ArticleJsonLd';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';

const BASE = 'https://remotejobs44.com';

export function generateStaticParams() {
  return ARTICLES.map(a => ({ slug: a.slug }));
}

// Author byline. The audit flagged Organization-as-author as an E-E-A-T
// weakness — Google + AI engines weight named human authors as more
// citation-worthy. "RemoteJobs44 Editorial" is fine for a team byline
// without inventing fake names; the matching authorUrl links to /about
// where the team's mission is described.
const AUTHOR_NAME = 'RemoteJobs44 Editorial';
const AUTHOR_URL  = `${BASE}/about#editorial`;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = findArticle((await params).slug);
  if (!a) return {};
  const url = `${BASE}/resources/${a.slug}`;
  // Per-article OG image — was sharing the generic site OG before.
  const ogImage = `${BASE}/api/og?title=${encodeURIComponent(a.title)}&subtitle=${encodeURIComponent('RemoteJobs44 Resources')}`;
  return {
    title: `${a.title} | RemoteJobs44`,
    description: a.description,
    alternates: { canonical: url },
    openGraph: {
      title: a.title,
      description: a.description,
      url,
      type: 'article',
      publishedTime: a.updated,
      authors: [AUTHOR_NAME],
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: a.title, description: a.description, images: [ogImage] },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = findArticle((await params).slug);
  if (!a) notFound();

  const url = `${BASE}/resources/${a.slug}`;

  return (
    <div className="max-w-[760px] mx-auto px-5 py-10">
      <ArticleJsonLd
        url={url}
        title={a.title}
        description={a.description}
        datePublished={a.updated}
        dateModified={a.updated}
        authorName={AUTHOR_NAME}
        authorUrl={AUTHOR_URL}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home',      href: '/'           },
          { name: 'Resources', href: '/resources'  },
          { name: a.title,     href: `/resources/${a.slug}` },
        ]}
      />
      <Link href="/resources" className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 dark:text-brand-400 hover:underline mb-5">
        <ArrowLeft className="w-3 h-3" /> All resources
      </Link>

      <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight leading-tight mb-3">{a.title}</h1>
      <p className="text-stone-500 dark:text-stone-400 leading-relaxed mb-4">{a.description}</p>
      <div className="flex items-center gap-3 text-xs text-stone-400 dark:text-stone-500 mb-8 flex-wrap">
        <span>By <a href="/about#editorial" className="text-stone-600 dark:text-stone-300 font-semibold hover:text-brand-700 dark:hover:text-brand-400 hover:underline">{AUTHOR_NAME}</a></span>
        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {a.readMinutes} min read</span>
        <span className="inline-flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          Updated <time dateTime={a.updated}>{new Date(a.updated).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</time>
        </span>
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
