import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleJsonLd } from '@/components/seo/ArticleJsonLd';

const POST = {
  slug:          'how-to-find-remote-jobs-in-nigeria',
  title:         'How to Find Remote Jobs in Nigeria in 2025',
  description:   'A complete guide to landing international remote work from Nigeria — platforms, payment methods, in-demand skills, and salary expectations.',
  datePublished: '2025-01-15',
  author:        'RemoteJobs44 Editorial',
  category:      'Job Search',
  readingTime:   '8 min read',
} as const;

const URL = `https://remotejobs44.com/blog/${POST.slug}`;

export const metadata: Metadata = {
  title: `${POST.title} | RemoteJobs44`,
  description: POST.description,
  alternates: { canonical: URL },
  openGraph: { title: POST.title, description: POST.description, url: URL, type: 'article', publishedTime: POST.datePublished },
};

export default function Post() {
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
      <Link href="/blog" className="text-sm text-stone-400 hover:text-brand-700 dark:hover:text-brand-400 transition-colors mb-8 inline-block">← Back to Blog</Link>

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
          How to Find Remote Jobs in Nigeria in 2025
        </h1>
        <p className="text-lg text-stone-500 dark:text-stone-400 leading-relaxed">
          Remote work has transformed what's possible for Nigerian professionals. Here's everything you need to know to land an international remote role from anywhere in Nigeria.
        </p>
      </div>

      <div className="job-prose space-y-6">
        {[
          { h: 'Why remote work is a game-changer for Nigerians', p: 'The average international remote salary is $40,000–$120,000 per year — paid in dollars or euros. For a Nigerian professional earning in naira, this represents a dramatic income increase. Companies in the US, UK, and Europe actively hire talented remote workers from Nigeria, especially in engineering, design, marketing, and finance.' },
          { h: 'The most in-demand skills for remote work', p: 'Software engineering (React, Python, Node.js) is the highest-paying remote category. Product design (Figma, UX research) is growing fast. Digital marketing, content writing, data analysis, and customer success are accessible entry points that don\'t require a CS degree.' },
          { h: 'Best platforms to find remote jobs', p: 'RemoteJobs44 aggregates 50,000+ remote jobs from top companies. We Work Remotely, Remote.co, and Remotive list vetted remote positions. LinkedIn remote filter and Greenhouse/Lever ATS boards at specific companies are excellent sources for mid-to-senior roles.' },
          { h: 'How to get paid internationally', p: 'Wise (TransferWise) is the most popular option — low fees, fast transfers to Nigerian bank accounts. Grey, Geegpay, and Chipper Cash are built specifically for African remote workers. Some employers will also set you up on Deel or Remote.com for payroll compliance.' },
          { h: 'How to stand out as a Nigerian applicant', p: 'Competition is global, so quality matters. Build a strong GitHub profile or portfolio. Write a compelling cover letter that addresses timezone availability and your communication tools (Slack, Zoom, Notion). List your current time zone (WAT, UTC+1) — it overlaps with European morning hours, which is a genuine advantage.' },
          { h: 'Your first step', p: 'Start by browsing RemoteJobs44 for free. When you\'re ready to apply, a Day Pass at ₦500 gives you 24-hour access to all contact emails and apply links. Go all-in with Pro at ₦2,999/month for unlimited applications, job alerts, and auto-apply.' },
        ].map((section, i) => (
          <div key={i}>
            <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-3">{section.h}</h2>
            <p className="text-stone-500 dark:text-stone-400 leading-relaxed">{section.p}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 card p-6 bg-brand-50 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800">
        <h3 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">Ready to start your remote career?</h3>
        <p className="text-stone-500 dark:text-stone-400 text-sm mb-4">Browse 50,000+ remote jobs. Access from ₦500.</p>
        <Link href="/jobs" className="inline-block px-6 py-3 bg-brand-700 text-white font-bold rounded-xl hover:bg-brand-600 transition-colors text-sm">
          Browse Jobs →
        </Link>
      </div>
    </div>
  );
}
