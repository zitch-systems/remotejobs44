// app/how-it-works/page.tsx — Explains the platform end-to-end.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, Filter, Send, FileText, Brain, CreditCard, ArrowRight } from 'lucide-react';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'How RemoteJobs44 Works — From Browsing to Landing a Remote Job',
  description: 'Step-by-step: how to use RemoteJobs44 to find, apply to, and land a remote job from Africa. Free browsing, ₦500 Day Pass, Pro plans with AI tools.',
  alternates: { canonical: `${BASE}/how-it-works` },
};

const STEPS = [
  { n: 1, icon: Search,     title: 'Browse for free', body: 'Search 50,000+ remote jobs from 8+ aggregators and direct ATS feeds, refreshed every 6 hours. No signup required to browse.' },
  { n: 2, icon: Filter,     title: 'Filter aggressively', body: 'Filter by category, role, country, timezone, salary, and posting date. Save searches and bookmark roles to revisit.' },
  { n: 3, icon: CreditCard, title: 'Unlock apply links', body: 'A ₦500 Day Pass gives 24 hours of full access with 10 applications. Or go Pro for unlimited applications + AI tools.' },
  { n: 4, icon: Brain,      title: 'AI CV review', body: 'Paste your CV, get a 0–100 score with strengths, gaps, missing ATS keywords, and rewrite tips. Tailor your CV before applying.' },
  { n: 5, icon: FileText,   title: 'AI interview prep', body: 'Type a role + level, get behavioural and technical questions with answer skeletons. Practice before the call.' },
  { n: 6, icon: Send,       title: 'Track applications', body: 'Every apply is saved to your tracker. Status updates as you progress through interviews. Never lose track of where you stand.' },
];

export default function HowItWorks() {
  return (
    <div className="max-w-[900px] mx-auto px-5 py-10">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
          How it works
        </div>
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
          From browsing to landing a remote job
        </h1>
        <p className="text-stone-500 dark:text-stone-400 mt-3 max-w-2xl mx-auto leading-relaxed">
          RemoteJobs44 takes you from "where do I even start" to "I got the offer" — with honest pricing built for African talent and AI tools that make a real difference.
        </p>
      </div>

      <div className="space-y-4">
        {STEPS.map(({ n, icon: Icon, title, body }) => (
          <div key={n} className="card p-5 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center shrink-0 font-display font-extrabold text-xl">
              {n}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-1 flex items-center gap-2">
                <Icon className="w-4 h-4 text-brand-600" /> {title}
              </h2>
              <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-6 mt-8 bg-brand-50/40 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800 text-center">
        <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">Ready to start?</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
          Browse free, then unlock with a ₦500 Day Pass when you find roles worth applying to.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/jobs" className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
            Browse jobs <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/pricing" className="inline-flex items-center gap-2 px-6 py-3 border border-stone-200 dark:border-[#1e3a5f] text-stone-700 dark:text-stone-300 text-sm font-bold rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            See pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
