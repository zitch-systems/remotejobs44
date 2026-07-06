// app/for-employers/page.tsx — Employer-targeted landing page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Users, Globe2, Brain, Send, ArrowRight, CheckCircle } from 'lucide-react';
import { waLink } from '@/lib/whatsapp';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'For Employers — Hire Remote Talent from Africa | RemoteJobs44',
  description: 'Post remote roles and reach 5,000+ vetted African professionals — engineers, designers, marketers, and customer success. Direct apply to your ATS. List on RemoteJobs44.',
  alternates: { canonical: `${BASE}/for-employers` },
};

const BENEFITS = [
  { icon: Users,   title: '5,000+ active African candidates', body: 'Engineering, design, product, marketing, sales, and customer success — sourced primarily from Nigeria, Kenya, South Africa, Ghana, Egypt, and Morocco.' },
  { icon: Globe2,  title: 'WAT/EAT/SAST timezones — overlap with EU and US East Coast', body: 'Most candidates can do a full overlap with London (UTC+0 to +3) and 2–4 hours with US East Coast — making them ideal for distributed teams across both regions.' },
  { icon: Brain,   title: 'CVs pre-screened by AI', body: 'Candidates run their CVs through our AI review before applying — you receive applications from people who understood the JD and tailored to it.' },
  { icon: Send,    title: 'Direct apply to your ATS', body: 'When you give us your Greenhouse / Lever / Ashby / Workable URL, applicants reach your real ATS — not a copy. No data fragmentation.' },
];

const STEPS = [
  'Email hello@remotejobs44.com with your role and target candidates.',
  'We import your Greenhouse / Lever / Ashby / Workable feed (free, automatic).',
  'Your roles appear on RemoteJobs44 and in our category / country / skill landing pages.',
  'Applicants apply directly through your ATS — you keep your existing pipeline tools.',
];

export default function ForEmployers() {
  return (
    <div className="max-w-[900px] mx-auto px-5 py-10">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
          For Employers
        </div>
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
          Hire vetted remote talent from Africa
        </h1>
        <p className="text-stone-500 dark:text-stone-400 mt-3 max-w-2xl mx-auto leading-relaxed">
          5,000+ active African remote workers — engineering, design, product, marketing, customer success. Direct ATS integration, no data fragmentation, no fee for basic listing.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
          <a href="mailto:hello@remotejobs44.com?subject=Employer%20inquiry"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
            Email us <ArrowRight className="w-4 h-4" />
          </a>
          <a href={waLink('Hi RemoteJobs44 — I’d like to post a role / partner with you.')} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 border border-stone-200 dark:border-[#1e3a5f] text-stone-700 dark:text-stone-300 text-sm font-bold rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            WhatsApp
          </a>
        </div>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        {BENEFITS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card p-5">
            <div className="w-11 h-11 rounded-xl bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center mb-3">
              <Icon className="w-5 h-5" />
            </div>
            <h2 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 mb-2">{title}</h2>
            <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      {/* How to get listed */}
      <div className="card p-6 mt-8">
        <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-4">How to list your roles</h2>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">{i+1}</div>
              <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">{s}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-stone-400 mt-4">
          <CheckCircle className="w-3 h-3 inline mr-1 text-brand-600" />
          Basic listing is free. Featured placement and direct sourcing services available — email for pricing.
        </p>
      </div>

      <div className="text-center mt-8">
        <p className="text-sm text-stone-500 mb-3">Questions?</p>
        <a href="mailto:hello@remotejobs44.com" className="text-brand-700 dark:text-brand-400 font-bold hover:underline">
          hello@remotejobs44.com
        </a>
      </div>
    </div>
  );
}
