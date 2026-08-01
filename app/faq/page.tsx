// app/faq/page.tsx — FAQ with JSON-LD FAQPage schema (rich Google result).
import type { Metadata } from 'next';
import Link from 'next/link';
import { HelpCircle, ArrowRight } from 'lucide-react';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description: 'Frequently asked questions about RemoteJobs44 — pricing, payments, AI tools, application tracking, and remote work from Africa.',
  alternates: { canonical: `${BASE}/faq` },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is RemoteJobs44 free to use?',
    a: 'Yes — browsing all 70,000+ remote jobs and saving favourites is completely free. You only pay if you want to apply to roles via the platform or use the AI tools. The Day Pass (₦500) gives you 24 hours of full access with 10 applications. Pro Monthly (₦2,999) or Pro Annual (₦29,999) unlock unlimited applications and AI tools.',
  },
  {
    q: 'How do I get paid by remote employers?',
    a: 'Most remote companies pay via Wise (TransferWise), Deel, Remote.com, Geegpay, Grey, Chipper Cash, or Payoneer. These route USD / GBP / EUR into your local Nigerian, Kenyan, South African, or Ghanaian bank account. For full-time roles, the employer typically uses Deel or Remote.com which handles payroll, contracts, and benefits for you.',
  },
  {
    q: 'Will US / UK / EU companies actually hire from Africa?',
    a: 'Yes — and increasingly so. Companies like Stripe, GitLab, Toptal, Andela, Automattic, and hundreds of YC-funded startups regularly hire from Nigeria, Kenya, South Africa, Ghana, Egypt, and Morocco. The key signals: clear written English, demonstrated output (portfolio / GitHub), and timezone overlap with the team’s core hours.',
  },
  {
    q: 'How are jobs sourced?',
    a: 'We aggregate from 8+ major job APIs (Remotive, RemoteOK, Arbeitnow, Working Nomads, Himalayas, Jobicy, SerpApi-backed Google Jobs) and direct Greenhouse / Lever / Ashby / Workable ATS feeds, refreshed every 6 hours. Duplicates and expired listings are filtered automatically.',
  },
  {
    q: 'What is the AI CV Review?',
    a: 'A Pro feature: paste your CV text, choose a target role, and receive a 0–100 score, a list of strengths, gaps, missing ATS keywords, and rewrite tips. The review uses one of 8 supported AI providers (Claude, OpenAI, Gemini, Groq, Mistral, etc.) that an admin enables in the platform.',
  },
  {
    q: 'What is the AI Interview Prep?',
    a: 'Type a role + level (e.g. "Senior Backend Engineer"), get back behavioural, technical, and remote-specific interview questions with answer skeletons and red-flag mistakes to avoid. Pro feature.',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Yes, anytime. Cancellation is "soft" — you keep Pro access until the end of your current billing period, then auto-downgrade to Free. We never charge cancellation fees. Manage cancellation from /settings → Billing.',
  },
  {
    q: 'Is my payment information secure?',
    a: 'Yes. All payments go through Paystack, which is PCI-DSS Level 1 certified. RemoteJobs44 never stores card numbers — only a customer reference. Webhooks are signed with HMAC-SHA512 and verified server-side before any subscription changes.',
  },
  {
    q: 'Does Day Pass roll over if I don’t use my 10 applications?',
    a: 'No. Day Pass is a 24-hour window with a 10-application limit. Unused applications expire when the window does. If you need more, Pro Monthly gives unlimited applications for ₦2,999 / month.',
  },
  {
    q: 'How is RemoteJobs44 different from Indeed or LinkedIn?',
    a: 'Indeed and LinkedIn aren’t remote-first — most "remote" listings on those sites are actually hybrid or US-only. RemoteJobs44 only carries fully-remote roles, with explicit filters for African candidates: region, timezone overlap, and country eligibility. We also include AI CV review and interview prep, which neither offers.',
  },
  {
    q: 'Where are you based and who runs this?',
    a: 'RemoteJobs44 is built and operated by a small team based in Nigeria. We started because the existing remote job boards weren’t designed for African talent — pricing was in USD, filtering by African region was non-existent, and there was no localised support. See /about for more.',
  },
  {
    q: 'Do you have a mobile app?',
    a: 'Yes — RemoteJobs44 is a Progressive Web App (PWA), so you can "Add to Home Screen" from your mobile browser and use it like a native app. No app store install required.',
  },
];

export default function FaqPage() {
  // FAQPage JSON-LD for rich Google result
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <div className="max-w-[800px] mx-auto px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
          <HelpCircle className="w-3.5 h-3.5" /> Frequently Asked Questions
        </div>
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
          Common questions, honest answers
        </h1>
      </div>

      <div className="space-y-3">
        {FAQS.map((f, i) => (
          <details key={i} className="card p-5 group">
            <summary className="font-bold text-base text-stone-900 dark:text-stone-100 cursor-pointer list-none flex items-center justify-between gap-3">
              {f.q}
              <span className="text-brand-600 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed mt-3">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="card p-6 mt-8 bg-brand-50/40 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800 text-center">
        <p className="text-sm text-stone-700 dark:text-stone-300 mb-3">Question not answered?</p>
        <Link href="/contact"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
          Contact us <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
