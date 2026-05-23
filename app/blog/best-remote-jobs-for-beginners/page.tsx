import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Best Remote Jobs for Beginners With No Experience | RemoteJobs44',
  description: 'Entry-level remote roles that are hiring globally right now — no degree required, competitive pay, and real career growth paths.',
};

const JOBS = [
  { title: 'Customer Support Specialist', salary: '$25,000–$45,000', skills: 'Communication, empathy, patience', why: 'Massive demand — every SaaS company needs support. Fully remote, async-friendly, and a great foot in the door at tech companies.' },
  { title: 'Content Writer', salary: '$30,000–$60,000', skills: 'Writing, research, SEO basics', why: 'Agencies and startups need content constantly. Start with one niche (tech, finance, health). Freelance first, then go full-time remote.' },
  { title: 'Virtual Assistant', salary: '$20,000–$40,000', skills: 'Organisation, email, calendar management', why: 'Executives and founders globally need VAs. Platforms like Fancy Hands, Time Etc, and Belay hire internationally.' },
  { title: 'Junior Data Analyst', salary: '$40,000–$65,000', skills: 'Excel, SQL basics, Google Sheets', why: 'A SQL course (free on Mode Analytics) is often enough. Companies want people who can pull reports and spot trends.' },
  { title: 'Social Media Manager', salary: '$35,000–$55,000', skills: 'Instagram, Twitter/X, Canva, analytics', why: 'Small businesses and creators need help. Build a portfolio by managing 2–3 accounts for free first, then charge.' },
];

export default function Post() {
  return (
    <div className="max-w-[720px] mx-auto px-5 py-14">
      <Link href="/blog" className="text-sm text-stone-400 hover:text-brand-700 transition-colors mb-8 inline-block">← Back to Blog</Link>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold">Career</span>
          <span className="text-xs text-stone-400">January 5, 2025 · 5 min read</span>
        </div>
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight mb-4">
          Best Remote Jobs for Beginners With No Experience
        </h1>
        <p className="text-lg text-stone-500 dark:text-stone-400 leading-relaxed">
          You don't need years of experience to work remotely. These entry-level roles are hiring globally right now — and they pay well.
        </p>
      </div>
      <div className="space-y-5">
        {JOBS.map((job, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
              <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100">{job.title}</h2>
              <span className="font-bold text-brand-700 dark:text-brand-400 text-sm">{job.salary}/yr</span>
            </div>
            <p className="text-xs text-stone-400 dark:text-stone-500 mb-2"><strong className="text-stone-600 dark:text-stone-300">Skills needed:</strong> {job.skills}</p>
            <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">{job.why}</p>
            <Link href={`/jobs?q=${encodeURIComponent(job.title)}`} className="text-xs text-brand-700 dark:text-brand-400 font-semibold hover:underline mt-2 inline-block">
              See {job.title} jobs →
            </Link>
          </div>
        ))}
      </div>
      <div className="mt-12 card p-6 bg-brand-50 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800">
        <h3 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">Start your remote job search today</h3>
        <p className="text-stone-500 dark:text-stone-400 text-sm mb-4">Browse free. Apply from ₦1,000.</p>
        <Link href="/jobs" className="inline-block px-6 py-3 bg-brand-700 text-white font-bold rounded-xl hover:bg-brand-600 transition-colors text-sm">Browse Jobs →</Link>
      </div>
    </div>
  );
}
