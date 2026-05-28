import type { Metadata } from 'next';
import Link from 'next/link';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'About RemoteJobs44',
  description: 'RemoteJobs44 connects job seekers worldwide with the best remote opportunities from top companies.',
};

// Refresh stats hourly. Cheap counts on indexed columns, but no point
// re-running them on every visit.
export const revalidate = 3600;

// Real DB-backed counts. The previous static "50,000+ jobs / 8,000+
// companies / 190+ countries" was unverifiable and inflated — a savvy
// user counting jobs in /jobs would catch the lie and lose trust. We
// now read live numbers and round down conservatively.
async function loadStats() {
  try {
    const supabase = createAdminSupabaseClient();
    const [jobsRes, companiesRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      // Distinct company count via a custom RPC is faster, but a
      // limit-1k probe gives us a sensible cardinality estimate without
      // requiring a new DB function. We undercount above 1k — fine for
      // a public-facing number we'd rather not over-claim.
      supabase
        .from('jobs')
        .select('company')
        .eq('is_active', true)
        .limit(5000),
    ]);
    const totalJobs = jobsRes.count ?? 0;
    const distinctCompanies = new Set(
      (companiesRes.data ?? []).map((r: any) => (r.company as string).trim().toLowerCase())
    ).size;
    return { totalJobs, distinctCompanies };
  } catch {
    return { totalJobs: 0, distinctCompanies: 0 };
  }
}

function roundDown(n: number): string {
  if (n >= 10000) return `${Math.floor(n / 1000)}k+`;
  if (n >= 1000)  return `${Math.floor(n / 100) * 100}+`;
  if (n >= 100)   return `${Math.floor(n / 10) * 10}+`;
  return String(n);
}

const VALUES = [
  { icon: '🌍', title: 'Global first', desc: 'Remote work erases borders. We list jobs from every corner of the world, accessible to anyone with an internet connection.' },
  { icon: '💳', title: 'Affordable access', desc: 'A Day Pass costs just ₦1,000. We believe career opportunities should be accessible, not gated behind expensive subscriptions.' },
  { icon: '⚡', title: 'Move fast', desc: 'Jobs are refreshed every 6 hours. You see the freshest listings before anyone else, so you can apply first.' },
  { icon: '🔒', title: 'Private by default', desc: 'We never sell your data. Your CV, applications, and profile stay private. Payments are secured by Paystack.' },
];

export default async function AboutPage() {
  const { totalJobs, distinctCompanies } = await loadStats();
  const stats = [
    { value: roundDown(totalJobs),         label: 'Remote jobs listed' },
    { value: roundDown(distinctCompanies), label: 'Companies hiring'    },
    { value: 'Every 6h',                   label: 'Listings refreshed'  },
    { value: '₦500',                       label: 'Day Pass — start here' },
  ];

  return (
    <div className="max-w-[900px] mx-auto px-5 py-16">

      {/* Hero */}
      <div className="text-center mb-16">
        <h1 className="font-display font-extrabold text-4xl text-stone-900 dark:text-stone-100 tracking-tight mb-4">
          We&rsquo;re building the world&rsquo;s<br />most accessible remote job platform
        </h1>
        <p className="text-stone-400 dark:text-stone-500 text-lg max-w-xl mx-auto leading-relaxed">
          RemoteJobs44 was built for job seekers everywhere — especially those in markets where $50/month subscriptions aren&rsquo;t realistic.
        </p>
      </div>

      {/* Stats — live from DB, refreshed hourly */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
        {stats.map(s => (
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

      {/* Editorial section — author bylines on /blog/* and /resources/*
          link here, so the byline lands on real context about who's
          writing rather than a generic Organization page. */}
      <section id="editorial" className="mb-16 scroll-mt-24">
        <h2 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-5">RemoteJobs44 Editorial</h2>
        <div className="card p-6 space-y-3">
          <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
            The Editorial team writes the blog posts and resource articles you find on RemoteJobs44. We&rsquo;re Nigerian remote-work practitioners — engineers, designers, and operators who landed our own international remote jobs and now help others do the same.
          </p>
          <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
            Everything we publish is checked against current job-board data and our own application experience. We don&rsquo;t publish AI-generated content. When a piece is reviewed by a domain specialist (a senior engineer on the engineering-jobs guide, a recruiter on the CV review tips), we say so on the byline.
          </p>
          <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
            Spot something wrong or out-of-date? <a href="mailto:hello@remotejobs44.com" className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">Tell us</a> — we&rsquo;ll update the article and note the correction.
          </p>
        </div>
      </section>

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
