// lib/seo-faqs.ts
//
// Templated FAQ questions per slice type. Each landing page calls
// `buildSliceFaqs(type, label)` and gets back 4 Q&A items tailored
// to its slice. The same items are rendered visibly on the page AND
// emitted as FAQPage JSON-LD — Google sometimes shows them as an
// accordion under the SERP result and ChatGPT / Perplexity pull them
// as direct-answer fodder.
//
// Why templated rather than per-slug hand-written: there are 200+ slices
// across 7 page types. Hand-writing FAQs for each is not realistic; a
// template that interpolates the label gives Google enough variance to
// treat each page as unique without flagging them as doorway content.

export type SliceType =
  | 'category'
  | 'skill'
  | 'country'
  | 'region'
  | 'timezone'
  | 'industry'
  | 'city';

export interface Faq {
  q: string;
  a: string;
}

const TEMPLATES: Record<SliceType, (label: string) => Faq[]> = {
  category: (label) => [
    {
      q: `Can I work remotely in ${label} from Africa?`,
      a: `Yes. Most companies hiring remotely for ${label} roles accept candidates from any timezone, including Nigeria, Kenya, South Africa, Ghana and other African markets. Many list "Worldwide" or "EMEA" explicitly; others overlap with European or US business hours. We surface country-friendly roles first.`,
    },
    {
      q: `How much do remote ${label} jobs pay?`,
      a: `Salary varies widely. For roles that disclose a range on the source ATS, you'll see it on the job card. Junior remote ${label} roles typically pay $25k-$45k/yr, mid-level $45k-$90k, senior $90k-$160k+. Use the salary filter on /jobs to narrow to a band.`,
    },
    {
      q: `What companies are hiring remote ${label} right now?`,
      a: `We aggregate from Remotive, RemoteOK, Arbeitnow, Jobicy, Findwork, Greenhouse, Lever, Ashby, Workable and Google Jobs. Hundreds of companies post ${label} roles every week — see the live list above and browse /companies for the active employer directory.`,
    },
    {
      q: `How fast can I land a remote ${label} job through RemoteJobs44?`,
      a: `Most users land their first interview within 2-3 weeks of active applying. The Day Pass (₦500) gives you 24 hours of full apply-link access — useful for a focused weekend sprint. Pro Monthly (₦2,999) unlocks unlimited applications plus alerts and AI CV review.`,
    },
  ],

  skill: (label) => [
    {
      q: `Which companies hire remote ${label} engineers?`,
      a: `Both well-known names (Shopify, GitLab, Buffer, Automattic, Toptal-style consultancies) and hundreds of smaller startups post ${label} roles remotely. We aggregate from 8+ job boards and direct ATS feeds so the list updates every 6 hours.`,
    },
    {
      q: `What's the typical salary for a remote ${label} role?`,
      a: `Mid-level remote ${label} engineers usually earn $55k-$110k/yr; senior engineers $90k-$180k; staff/lead $130k-$220k+. Companies hiring from Africa often pay closer to the lower end of these ranges, but international Pro-level roles routinely match US rates.`,
    },
    {
      q: `Can I get a ${label} job without a CS degree?`,
      a: `Yes — most companies prioritise demonstrated experience over credentials. A solid portfolio (GitHub, side projects), a focused CV, and 1-2 referrals usually outweigh a degree. The AI CV review tool on Pro highlights gaps that block ATS systems.`,
    },
    {
      q: `What level of experience do remote ${label} jobs require?`,
      a: `Listings range from junior (0-2 years) to staff/principal (8+ years). Filter by Level on /jobs/skill/${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')} to match your seniority. Most listings explicitly state required experience in the body.`,
    },
  ],

  country: (label) => [
    {
      q: `Are remote jobs from ${label} legitimate?`,
      a: `Yes when you apply through verified ATS feeds (Greenhouse, Lever, Ashby, Workable) or aggregators we've vetted. We flag suspicious patterns at ingest (Telegram/WhatsApp apply requests, MLM signals, "earn $5k/week" claims) so they don't reach the public board.`,
    },
    {
      q: `How do international companies pay people in ${label}?`,
      a: `Most pay via Wise, Deel, Remote.com, Payoneer or direct USD/EUR bank transfer to a local USD-domiciled account. Wise and Deel are the most popular options for African remote workers — both let you receive USD and convert to local currency at near-interbank rates.`,
    },
    {
      q: `What's the timezone overlap between ${label} and US/EU companies?`,
      a: `${label}-based candidates overlap meaningfully with European mornings/afternoons (CET/GMT/UTC) and US Eastern mornings (EST). Most async-remote companies require 3-4 hours of overlap; some are fully async. Listings on /jobs/country/${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')} surface the timezone requirement when the upstream feed exposes it.`,
    },
    {
      q: `Do I need a visa to work remotely for a US/EU company from ${label}?`,
      a: `No. Remote roles are typically classified as contractor relationships (1099-equivalent in the US, freelance in EU), so no work visa is required. You handle your own tax registration locally. Some employers offer a "EOR" (employer-of-record) arrangement via Deel or Remote.com that adds local payroll/benefits handling.`,
    },
  ],

  region: (label) => [
    {
      q: `Which countries does the "${label}" filter cover?`,
      a: `The ${label} filter surfaces jobs whose listed location includes any major country in the region. We update the region keyword map regularly — see /jobs/region/${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')} for the live list.`,
    },
    {
      q: `Are jobs in ${label} open to candidates from other regions?`,
      a: `Many are — most "${label}" listings explicitly accept worldwide candidates and just note ${label} as the preferred-overlap region. Use the Country filter on /jobs for stricter geographic eligibility.`,
    },
    {
      q: `What's the typical timezone for ${label} roles?`,
      a: `${label} roles usually expect 3-5 hours of overlap with the region's business hours. The exact window is in each job's body. If a posting is "async" or "fully remote", overlap requirements are minimal.`,
    },
    {
      q: `Are these jobs paid in local currency?`,
      a: `Usually no — most remote roles pay in USD, EUR or GBP regardless of region. Some ${label} employers pay in local currency; the listing specifies when it does. Most international payment platforms (Wise, Deel, Payoneer) handle currency conversion automatically.`,
    },
  ],

  timezone: (label) => [
    {
      q: `Why filter by ${label}?`,
      a: `Some companies require live overlap with a specific timezone for sync meetings, on-call rotations, or customer support. Filtering by ${label} pulls jobs whose listing explicitly mentions that timezone window — useful when your sleep schedule has hard constraints.`,
    },
    {
      q: `Are jobs in this timezone "9-to-5 in ${label}" or just overlap-friendly?`,
      a: `Both. Some listings require strict ${label} business hours (typically 9am-5pm local); others ask for 3-4 hours of overlap and otherwise let you set your own schedule. The job body specifies which.`,
    },
    {
      q: `Can I apply from outside ${label}?`,
      a: `Often yes — many roles allow applicants from any country as long as they can overlap with the listed timezone window. Use the Country filter alongside to confirm eligibility.`,
    },
    {
      q: `Are async-friendly jobs included in the ${label} filter?`,
      a: `When the job description mentions ${label} as a preferred or overlap timezone, yes. Fully-async roles with no timezone requirement appear under /jobs/region/worldwide instead.`,
    },
  ],

  industry: (label) => [
    {
      q: `What kinds of roles are in remote ${label} jobs?`,
      a: `${label} companies hire across engineering, design, product, marketing, finance, ops and sales — same shape as any tech company. ${label}-specific roles also show up (compliance, risk, integrations). Filter by Category on top to narrow.`,
    },
    {
      q: `Are remote ${label} jobs at startups or established companies?`,
      a: `Both. We surface roles at early-stage startups, growth-stage scale-ups and large public ${label} companies. Use the Company Size filter on /jobs to narrow.`,
    },
    {
      q: `Do remote ${label} jobs require domain-specific experience?`,
      a: `Senior roles usually do; junior and mid-level roles often value strong fundamentals over ${label}-specific background. Most listings spell out which kind they're looking for.`,
    },
    {
      q: `What companies hire remote in ${label}?`,
      a: `See the live list on the page above. We aggregate from Remotive, RemoteOK, Jobicy, Greenhouse, Lever, Ashby and Workable — the active employer set updates every 6 hours.`,
    },
  ],

  city: (label) => [
    {
      q: `Can companies based outside ${label} hire me as a remote worker?`,
      a: `Yes. Most "Worldwide" or "remote-friendly" listings accept ${label}-based candidates as contractors. The country and region overlap rules from the surrounding country still apply.`,
    },
    {
      q: `How do international companies pay ${label}-based remote workers?`,
      a: `Wise, Deel, Remote.com, Payoneer and direct USD/EUR bank transfers to a USD-domiciled account are the standard options. Wise + Deel are the most popular in ${label}.`,
    },
    {
      q: `Are there meetups or coworking spaces for remote workers in ${label}?`,
      a: `Yes — there's an active remote-work community in ${label} with regular meetups, coworking spaces and informal Slack/WhatsApp groups. Search local tech communities for the current list.`,
    },
    {
      q: `What's the timezone overlap between ${label} and US/EU companies?`,
      a: `Africa-based workers overlap well with European business hours and the early part of the US East Coast day. Async-friendly companies are the easiest match if your schedule is rigid.`,
    },
  ],
};

export function buildSliceFaqs(type: SliceType, label: string): Faq[] {
  return TEMPLATES[type](label);
}
