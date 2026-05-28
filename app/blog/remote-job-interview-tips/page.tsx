import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleJsonLd } from '@/components/seo/ArticleJsonLd';

const POST = {
  slug:          'remote-job-interview-tips',
  title:         '12 Remote Job Interview Tips That Actually Work',
  description:   'Prepare for remote job interviews with proven tips — from technical setup to answering async communication questions.',
  datePublished: '2025-01-10',
  author:        'RemoteJobs44 Editorial',
  category:      'Interviews',
  readingTime:   '6 min read',
} as const;

const URL = `https://remotejobs44.com/blog/${POST.slug}`;

export const metadata: Metadata = {
  title: `${POST.title} | RemoteJobs44`,
  description: POST.description,
  alternates: { canonical: URL },
  openGraph: { title: POST.title, description: POST.description, url: URL, type: 'article', publishedTime: POST.datePublished },
};

export default function Post() {
  const tips = [
    { n: '01', title: 'Test your setup 30 minutes early', body: 'Camera, microphone, internet, and background. Use a plain wall or a simple virtual background. Nothing kills a first impression like 10 minutes of technical issues.' },
    { n: '02', title: 'Choose a quiet, well-lit space', body: 'Face a window for natural light. Avoid sitting with a window behind you — it turns you into a silhouette. A ring light ($20–$30) is a worthwhile investment.' },
    { n: '03', title: 'Learn the company\'s remote tools', body: 'Mention Slack, Notion, Linear, Figma, or whatever tools they use in your answers. It signals you\'re already familiar with async remote work culture.' },
    { n: '04', title: 'Have specific examples ready for async communication', body: 'Most interviewers will ask "how do you communicate across time zones?" Have a concrete story: "On my last project, I would post a daily async standup in Slack with blockers clearly labeled..."' },
    { n: '05', title: 'Address the time zone question proactively', body: 'If you\'re in Nigeria (WAT, UTC+1), note that you overlap with European mornings and can accommodate 9am EST calls by being online in the evening. Show flexibility.' },
    { n: '06', title: 'Know your numbers', body: 'Research market rates on levels.fyi, Glassdoor, or Glassdoor. Know your range before they ask. Saying "I\'m targeting $60–75k" is stronger than "I\'m open to discussion."' },
  ];

  return (
    <div className="max-w-[720px] mx-auto px-5 py-14">
      <ArticleJsonLd
        url={URL}
        title={POST.title}
        description={POST.description}
        datePublished={POST.datePublished}
        authorName={POST.author}
        authorUrl="https://remotejobs44.com/about"
      />
      <Link href="/blog" className="text-sm text-stone-400 hover:text-brand-700 transition-colors mb-8 inline-block">← Back to Blog</Link>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold">{POST.category}</span>
          <span className="text-xs text-stone-400">
            By <span className="text-stone-600 dark:text-stone-300 font-semibold">{POST.author}</span>
            {' · '}<time dateTime={POST.datePublished}>{new Date(POST.datePublished).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
            {' · '}{POST.readingTime}
          </span>
        </div>
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight mb-4">
          12 Remote Job Interview Tips That Actually Work
        </h1>
        <p className="text-lg text-stone-500 dark:text-stone-400 leading-relaxed">
          Remote interviews are evaluated differently from in-person ones. Here are the tips that matter most.
        </p>
      </div>
      <div className="space-y-6">
        {tips.map(tip => (
          <div key={tip.n} className="flex gap-5">
            <div className="font-display font-extrabold text-3xl text-brand-100 dark:text-brand-900 shrink-0 w-12">{tip.n}</div>
            <div>
              <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">{tip.title}</h2>
              <p className="text-stone-500 dark:text-stone-400 leading-relaxed text-sm">{tip.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-12 card p-6 bg-brand-50 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800">
        <h3 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">Find jobs worth interviewing for</h3>
        <p className="text-stone-500 dark:text-stone-400 text-sm mb-4">50,000+ remote jobs. Apply from ₦500.</p>
        <Link href="/jobs" className="inline-block px-6 py-3 bg-brand-700 text-white font-bold rounded-xl hover:bg-brand-600 transition-colors text-sm">Browse Jobs →</Link>
      </div>
    </div>
  );
}
