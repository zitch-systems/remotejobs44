import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About RemoteJobs44',
  description: 'RemoteJobs44 connects job seekers worldwide with the best remote opportunities from top companies.',
};

const STATS = [
  { value: '50,000+', label: 'Remote jobs listed' },
  { value: '8,000+',  label: 'Companies hiring' },
  { value: '190+',    label: 'Countries reached' },
  { value: '₦1,000',  label: 'Starting price' },
];

const VALUES = [
  { icon: '🌍', title: 'Global first', desc: 'Remote work erases borders. We list jobs from every corner of the world, accessible to anyone with an internet connection.' },
  { icon: '💳', title: 'Affordable access', desc: 'A Day Pass costs just ₦1,000. We believe career opportunities should be accessible, not gated behind expensive subscriptions.' },
  { icon: '⚡', title: 'Move fast', desc: 'Jobs are refreshed every 6 hours. You see the freshest listings before anyone else, so you can apply first.' },
  { icon: '🔒', title: 'Private by default', desc: 'We never sell your data. Your CV, applications, and profile stay private. Payments are secured by Paystack.' },
];

export default function AboutPage() {
  return (
    <div className="max-w-[900px] mx-auto px-5 py-16">

      {/* Hero */}
      <div className="text-center mb-16">
        <h1 className="font-display font-extrabold text-4xl text-stone-900 dark:text-stone-100 tracking-tight mb-4">
          We're building the world's<br />most accessible remote job platform
        </h1>
        <p className="text-stone-400 dark:text-stone-500 text-lg max-w-xl mx-auto leading-relaxed">
          RemoteJobs44 was built for job seekers everywhere — especially those in markets where $50/month subscriptions aren't realistic.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
        {STATS.map(s => (
          <div key={s.label} className="card p-5 text-center">
            <p className="font-display font-extrabold text-2xl text-brand-700 dark:text-brand-400 mb-1">{s.value}</p>
            <p className="text-xs text-stone-400 dark:text-stone-500 font-semibold uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Story */}
      <div className="mb-16">
        <h2 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-5">Our story</h2>
        <div className="space-y-4 text-stone-500 dark:text-stone-400 leading-relaxed">
          <p>
            Remote work exploded in 2020, but most job boards kept charging $30–$100/month — priced out of reach for job seekers in Nigeria, Kenya, India, and dozens of other markets where remote work could be truly life-changing.
          </p>
          <p>
            RemoteJobs44 was built to fix that. We automatically ingest thousands of jobs from top companies every day, using free public APIs from Greenhouse, Lever, Ashby, and direct RSS feeds. You see the same jobs as everyone else, for a fraction of the cost.
          </p>
          <p>
            Our Day Pass model means you can spend a focused day applying to 10 jobs for ₦500 — less than a cup of coffee in most cities. If you&apos;re actively job hunting, Pro gives you unlimited access for ₦2,999/month.
          </p>
        </div>
      </div>

      {/* Values */}
      <div className="mb-16">
        <h2 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-7">What we stand for</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {VALUES.map(v => (
            <div key={v.title} className="card p-6">
              <div className="text-3xl mb-3">{v.icon}</div>
              <h3 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">{v.title}</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="card p-8 text-center bg-brand-50 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800">
        <h2 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 mb-3">
          Ready to find your remote job?
        </h2>
        <p className="text-stone-400 dark:text-stone-500 mb-6">Browse free. Apply from ₦1,000. Work from anywhere.</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/jobs"
            className="px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 transition-colors">
            Browse Jobs
          </Link>
          <Link href="/register"
            className="px-6 py-3 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            Create Free Account
          </Link>
        </div>
      </div>
    </div>
  );
}
