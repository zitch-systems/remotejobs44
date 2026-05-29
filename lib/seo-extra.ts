// lib/seo-extra.ts
// Programmatic SEO catalogue — new slice types (industries, cities, salary
// roles, competitor comparisons) that generate dedicated landing pages.
// Used by both the sitemap and the dynamic [slug] routes under
// /jobs/industry, /jobs/city, /salary-guide, and /compare.

export interface SeoSlice {
  slug: string;
  label: string;
  blurb: string;
}

// ── Industries — vertical-specific landing pages ─────────────────────────
export const INDUSTRIES: readonly SeoSlice[] = [
  { slug: 'finance',    label: 'Finance',           blurb: 'Remote finance roles — accounting, FP&A, treasury, controller, payroll, and bookkeeping at global companies.' },
  { slug: 'fintech',    label: 'Fintech',           blurb: 'Remote roles at fintech and banking startups — payments, lending, crypto-rails, neobanks.' },
  { slug: 'crypto',     label: 'Crypto & Web3',     blurb: 'Remote roles at crypto exchanges, DeFi protocols, NFT platforms, and L1/L2 chains.' },
  { slug: 'ai',         label: 'AI & ML',           blurb: 'Remote roles at AI labs, ML platforms, vector databases, and applied-AI startups.' },
  { slug: 'saas',       label: 'SaaS',              blurb: 'Remote roles at SaaS companies — B2B tools, productivity, devtools, ops platforms.' },
  { slug: 'ecommerce',  label: 'E-commerce',        blurb: 'Remote roles at e-commerce platforms, DTC brands, marketplaces, and storefront tools.' },
  { slug: 'healthtech', label: 'Health Tech',       blurb: 'Remote roles at digital health, telemedicine, healthcare AI, and pharma-tech startups.' },
  { slug: 'edtech',     label: 'Ed Tech',           blurb: 'Remote roles at education technology — tutoring platforms, course creators, LMSs.' },
  { slug: 'climate',    label: 'Climate Tech',      blurb: 'Remote roles at climate, carbon, energy, and sustainability startups.' },
  { slug: 'gaming',     label: 'Gaming',            blurb: 'Remote roles at gaming studios, esports platforms, and game engines.' },
  { slug: 'agency',     label: 'Agency & Consulting', blurb: 'Remote roles at digital agencies, dev shops, and consulting firms hiring globally.' },
] as const;

// ── Cities — high-search-volume city pages ───────────────────────────────
export const CITIES: readonly SeoSlice[] = [
  { slug: 'lagos',          label: 'Lagos',          blurb: 'Remote jobs available to candidates based in Lagos, Nigeria. Work from home for US, UK, and EU companies.' },
  { slug: 'abuja',          label: 'Abuja',          blurb: 'Remote jobs for Abuja-based professionals — engineering, design, marketing, customer success.' },
  { slug: 'port-harcourt',  label: 'Port Harcourt',  blurb: 'Remote jobs open to Port Harcourt professionals at global remote-first companies.' },
  { slug: 'nairobi',        label: 'Nairobi',        blurb: 'Remote jobs in Nairobi — software, design, sales, ops. East African talent thrives in EU/UK time zones.' },
  { slug: 'mombasa',        label: 'Mombasa',        blurb: 'Remote work opportunities for Mombasa-based talent at international remote-first employers.' },
  { slug: 'cape-town',      label: 'Cape Town',      blurb: 'Remote roles for Cape Town professionals — high overlap with European and East-coast US hours.' },
  { slug: 'johannesburg',   label: 'Johannesburg',   blurb: 'Remote jobs open to Johannesburg-based engineers, designers, and PMs at global companies.' },
  { slug: 'durban',         label: 'Durban',         blurb: 'Remote work opportunities for Durban-based talent at global remote-first startups.' },
  { slug: 'accra',          label: 'Accra',          blurb: 'Remote jobs for Accra-based talent — engineering, design, content, sales, customer success.' },
  { slug: 'cairo',          label: 'Cairo',          blurb: 'Remote jobs for Cairo-based engineers and designers — Egyptian talent at global tech companies.' },
  { slug: 'casablanca',     label: 'Casablanca',     blurb: 'Remote roles for Casablanca professionals — Morocco is bilingual-friendly for French/English markets.' },
  { slug: 'kampala',        label: 'Kampala',        blurb: 'Remote opportunities for Kampala-based talent at international remote-first employers.' },
  { slug: 'kigali',         label: 'Kigali',         blurb: 'Remote roles for Rwanda-based professionals — Rwanda is one of Africa’s fastest-growing tech hubs.' },
  { slug: 'addis-ababa',    label: 'Addis Ababa',    blurb: 'Remote jobs open to Ethiopian talent — engineering, design, sales, ops at global companies.' },
  { slug: 'dar-es-salaam',  label: 'Dar es Salaam',  blurb: 'Remote work for Tanzanian talent at global remote-first startups and scale-ups.' },
] as const;

// ── Salary guide roles ───────────────────────────────────────────────────
// Per-role salary benchmark pages — driven by the slug below; data is hand
// written into the page template for each role's salary band.
export interface SalaryRole {
  slug: string;
  role: string;
  blurb: string;
  bands: { level: string; usdLow: number; usdHigh: number; nairaLow: number; nairaHigh: number }[];
  skills: string[];
  category: 'engineering' | 'design' | 'product' | 'data' | 'marketing' | 'sales' | 'ops';
}

export const SALARY_ROLES: readonly SalaryRole[] = [
  {
    slug: 'frontend-engineer', role: 'Frontend Engineer', category: 'engineering',
    blurb: 'React, Vue, Next.js, TypeScript, CSS — UI engineers for web products.',
    bands: [
      { level: 'Junior',    usdLow: 24000,  usdHigh: 48000,  nairaLow: 36000000,  nairaHigh: 72000000 },
      { level: 'Mid',       usdLow: 48000,  usdHigh: 90000,  nairaLow: 72000000,  nairaHigh: 135000000 },
      { level: 'Senior',    usdLow: 90000,  usdHigh: 150000, nairaLow: 135000000, nairaHigh: 225000000 },
      { level: 'Staff/Lead',usdLow: 140000, usdHigh: 220000, nairaLow: 210000000, nairaHigh: 330000000 },
    ],
    skills: ['React','TypeScript','Next.js','CSS','Vue','Tailwind'],
  },
  {
    slug: 'backend-engineer', role: 'Backend Engineer', category: 'engineering',
    blurb: 'Node.js, Python, Go, Java — server-side engineering, APIs, databases.',
    bands: [
      { level: 'Junior',    usdLow: 28000,  usdHigh: 55000,  nairaLow: 42000000,  nairaHigh: 82500000 },
      { level: 'Mid',       usdLow: 55000,  usdHigh: 100000, nairaLow: 82500000,  nairaHigh: 150000000 },
      { level: 'Senior',    usdLow: 100000, usdHigh: 165000, nairaLow: 150000000, nairaHigh: 247500000 },
      { level: 'Staff/Lead',usdLow: 150000, usdHigh: 240000, nairaLow: 225000000, nairaHigh: 360000000 },
    ],
    skills: ['Node.js','Python','Go','PostgreSQL','Java','AWS'],
  },
  {
    slug: 'fullstack-engineer', role: 'Full-stack Engineer', category: 'engineering',
    blurb: 'End-to-end developers comfortable in frontend AND backend codebases.',
    bands: [
      { level: 'Junior',    usdLow: 26000,  usdHigh: 52000,  nairaLow: 39000000,  nairaHigh: 78000000 },
      { level: 'Mid',       usdLow: 52000,  usdHigh: 95000,  nairaLow: 78000000,  nairaHigh: 142500000 },
      { level: 'Senior',    usdLow: 95000,  usdHigh: 155000, nairaLow: 142500000, nairaHigh: 232500000 },
      { level: 'Staff/Lead',usdLow: 145000, usdHigh: 230000, nairaLow: 217500000, nairaHigh: 345000000 },
    ],
    skills: ['TypeScript','React','Node.js','PostgreSQL','Next.js'],
  },
  {
    slug: 'mobile-engineer', role: 'Mobile Engineer (iOS/Android)', category: 'engineering',
    blurb: 'Swift, Kotlin, React Native, Flutter — native and cross-platform mobile.',
    bands: [
      { level: 'Junior',    usdLow: 28000,  usdHigh: 55000,  nairaLow: 42000000,  nairaHigh: 82500000 },
      { level: 'Mid',       usdLow: 55000,  usdHigh: 105000, nairaLow: 82500000,  nairaHigh: 157500000 },
      { level: 'Senior',    usdLow: 105000, usdHigh: 170000, nairaLow: 157500000, nairaHigh: 255000000 },
      { level: 'Staff/Lead',usdLow: 155000, usdHigh: 235000, nairaLow: 232500000, nairaHigh: 352500000 },
    ],
    skills: ['Swift','Kotlin','React Native','Flutter','iOS','Android'],
  },
  {
    slug: 'devops-engineer', role: 'DevOps / Platform Engineer', category: 'engineering',
    blurb: 'Kubernetes, Terraform, AWS, CI/CD — platform and infrastructure engineers.',
    bands: [
      { level: 'Junior',    usdLow: 32000,  usdHigh: 60000,  nairaLow: 48000000,  nairaHigh: 90000000 },
      { level: 'Mid',       usdLow: 60000,  usdHigh: 115000, nairaLow: 90000000,  nairaHigh: 172500000 },
      { level: 'Senior',    usdLow: 115000, usdHigh: 180000, nairaLow: 172500000, nairaHigh: 270000000 },
      { level: 'Staff/Lead',usdLow: 170000, usdHigh: 260000, nairaLow: 255000000, nairaHigh: 390000000 },
    ],
    skills: ['Kubernetes','Terraform','AWS','Docker','CI/CD','Linux'],
  },
  {
    slug: 'data-engineer', role: 'Data Engineer', category: 'data',
    blurb: 'ETL, warehousing, dbt, Snowflake, Airflow — pipelines and data platforms.',
    bands: [
      { level: 'Junior',    usdLow: 30000,  usdHigh: 58000,  nairaLow: 45000000,  nairaHigh: 87000000 },
      { level: 'Mid',       usdLow: 58000,  usdHigh: 110000, nairaLow: 87000000,  nairaHigh: 165000000 },
      { level: 'Senior',    usdLow: 110000, usdHigh: 175000, nairaLow: 165000000, nairaHigh: 262500000 },
      { level: 'Staff/Lead',usdLow: 160000, usdHigh: 240000, nairaLow: 240000000, nairaHigh: 360000000 },
    ],
    skills: ['Python','SQL','Snowflake','dbt','Airflow','Kafka'],
  },
  {
    slug: 'data-scientist', role: 'Data Scientist', category: 'data',
    blurb: 'Python, statistics, ML — analytics, modelling, experimentation.',
    bands: [
      { level: 'Junior',    usdLow: 32000,  usdHigh: 60000,  nairaLow: 48000000,  nairaHigh: 90000000 },
      { level: 'Mid',       usdLow: 60000,  usdHigh: 115000, nairaLow: 90000000,  nairaHigh: 172500000 },
      { level: 'Senior',    usdLow: 115000, usdHigh: 185000, nairaLow: 172500000, nairaHigh: 277500000 },
      { level: 'Staff/Lead',usdLow: 170000, usdHigh: 260000, nairaLow: 255000000, nairaHigh: 390000000 },
    ],
    skills: ['Python','SQL','Pandas','Scikit-learn','TensorFlow','Statistics'],
  },
  {
    slug: 'product-manager', role: 'Product Manager', category: 'product',
    blurb: 'Roadmaps, discovery, prioritisation — PM roles at SaaS, fintech, marketplaces.',
    bands: [
      { level: 'Associate', usdLow: 30000,  usdHigh: 60000,  nairaLow: 45000000,  nairaHigh: 90000000 },
      { level: 'Mid',       usdLow: 60000,  usdHigh: 115000, nairaLow: 90000000,  nairaHigh: 172500000 },
      { level: 'Senior',    usdLow: 115000, usdHigh: 180000, nairaLow: 172500000, nairaHigh: 270000000 },
      { level: 'Principal/Director', usdLow: 165000, usdHigh: 250000, nairaLow: 247500000, nairaHigh: 375000000 },
    ],
    skills: ['Roadmapping','SQL','Discovery','Analytics','User research','OKRs'],
  },
  {
    slug: 'product-designer', role: 'Product Designer', category: 'design',
    blurb: 'Figma, prototyping, UX research — design systems and product UX.',
    bands: [
      { level: 'Junior',    usdLow: 24000,  usdHigh: 48000,  nairaLow: 36000000,  nairaHigh: 72000000 },
      { level: 'Mid',       usdLow: 48000,  usdHigh: 90000,  nairaLow: 72000000,  nairaHigh: 135000000 },
      { level: 'Senior',    usdLow: 90000,  usdHigh: 145000, nairaLow: 135000000, nairaHigh: 217500000 },
      { level: 'Staff/Lead',usdLow: 135000, usdHigh: 215000, nairaLow: 202500000, nairaHigh: 322500000 },
    ],
    skills: ['Figma','Prototyping','Design systems','User research','Wireframing'],
  },
  {
    slug: 'growth-marketer', role: 'Growth / Performance Marketer', category: 'marketing',
    blurb: 'Paid acquisition, SEO, lifecycle — growth roles at SaaS and consumer.',
    bands: [
      { level: 'Junior',    usdLow: 24000,  usdHigh: 45000,  nairaLow: 36000000,  nairaHigh: 67500000 },
      { level: 'Mid',       usdLow: 45000,  usdHigh: 85000,  nairaLow: 67500000,  nairaHigh: 127500000 },
      { level: 'Senior',    usdLow: 85000,  usdHigh: 135000, nairaLow: 127500000, nairaHigh: 202500000 },
      { level: 'Head/Director',usdLow: 130000, usdHigh: 200000, nairaLow: 195000000, nairaHigh: 300000000 },
    ],
    skills: ['Google Ads','SEO','Analytics','SQL','Lifecycle','Attribution'],
  },
  {
    slug: 'content-marketer', role: 'Content Marketer / Writer', category: 'marketing',
    blurb: 'Long-form, SEO content, ghostwriting — content roles at B2B SaaS and media.',
    bands: [
      { level: 'Junior',    usdLow: 18000,  usdHigh: 38000,  nairaLow: 27000000,  nairaHigh: 57000000 },
      { level: 'Mid',       usdLow: 38000,  usdHigh: 75000,  nairaLow: 57000000,  nairaHigh: 112500000 },
      { level: 'Senior',    usdLow: 75000,  usdHigh: 120000, nairaLow: 112500000, nairaHigh: 180000000 },
      { level: 'Head/Lead', usdLow: 115000, usdHigh: 180000, nairaLow: 172500000, nairaHigh: 270000000 },
    ],
    skills: ['SEO','Content strategy','Editorial','Long-form writing','Analytics'],
  },
  {
    slug: 'customer-success', role: 'Customer Success Manager', category: 'ops',
    blurb: 'Onboarding, retention, expansion — CS roles at SaaS and B2B platforms.',
    bands: [
      { level: 'Junior',    usdLow: 24000,  usdHigh: 45000,  nairaLow: 36000000,  nairaHigh: 67500000 },
      { level: 'Mid',       usdLow: 45000,  usdHigh: 80000,  nairaLow: 67500000,  nairaHigh: 120000000 },
      { level: 'Senior',    usdLow: 80000,  usdHigh: 130000, nairaLow: 120000000, nairaHigh: 195000000 },
      { level: 'Head/Director',usdLow: 125000, usdHigh: 195000, nairaLow: 187500000, nairaHigh: 292500000 },
    ],
    skills: ['Onboarding','Retention','SaaS','Account management','SQL'],
  },
  {
    slug: 'sales-development', role: 'Sales Development Rep (SDR / BDR)', category: 'sales',
    blurb: 'Outbound, qualification, top-of-funnel — entry to mid-level B2B sales.',
    bands: [
      { level: 'Junior',    usdLow: 22000,  usdHigh: 42000,  nairaLow: 33000000,  nairaHigh: 63000000 },
      { level: 'Mid',       usdLow: 42000,  usdHigh: 75000,  nairaLow: 63000000,  nairaHigh: 112500000 },
      { level: 'Senior',    usdLow: 75000,  usdHigh: 120000, nairaLow: 112500000, nairaHigh: 180000000 },
    ],
    skills: ['Outbound','Cold email','LinkedIn','HubSpot','Salesforce'],
  },
  {
    slug: 'account-executive', role: 'Account Executive (AE)', category: 'sales',
    blurb: 'Closing roles in B2B SaaS — quota-carrying, mid-market and enterprise.',
    bands: [
      { level: 'Mid',       usdLow: 55000,  usdHigh: 110000, nairaLow: 82500000,  nairaHigh: 165000000 },
      { level: 'Senior',    usdLow: 110000, usdHigh: 180000, nairaLow: 165000000, nairaHigh: 270000000 },
      { level: 'Enterprise',usdLow: 170000, usdHigh: 280000, nairaLow: 255000000, nairaHigh: 420000000 },
    ],
    skills: ['Discovery','Demo','Negotiation','Salesforce','SaaS'],
  },
  {
    slug: 'recruiter', role: 'Recruiter / Talent Partner', category: 'ops',
    blurb: 'Tech recruiting, sourcing, talent ops — agency, in-house, and embedded.',
    bands: [
      { level: 'Junior',    usdLow: 22000,  usdHigh: 42000,  nairaLow: 33000000,  nairaHigh: 63000000 },
      { level: 'Mid',       usdLow: 42000,  usdHigh: 75000,  nairaLow: 63000000,  nairaHigh: 112500000 },
      { level: 'Senior',    usdLow: 75000,  usdHigh: 120000, nairaLow: 112500000, nairaHigh: 180000000 },
      { level: 'Head/Director',usdLow: 115000, usdHigh: 180000, nairaLow: 172500000, nairaHigh: 270000000 },
    ],
    skills: ['Sourcing','LinkedIn Recruiter','ATS','Pipeline management'],
  },
];

// ── Competitor comparison pages — capture branded-search traffic ─────────
export interface Competitor {
  slug: string;
  name: string;
  oneLiner: string;
  pros: string[];
  cons: string[];
}

export const COMPETITORS: readonly Competitor[] = [
  {
    slug: 'remote-co',
    name: 'Remote.co',
    oneLiner: 'Remote-first US-focused job board, established 2014, paid employer-post model.',
    pros: ['Established brand', 'Long company profiles', 'US-employer focus'],
    cons: ['Lower volume (~5,000 jobs)', 'No African pricing', 'No application tracker'],
  },
  {
    slug: 'flexjobs',
    name: 'FlexJobs',
    oneLiner: 'Subscription job board ($24.95/mo) — curated remote and hybrid roles, US/UK skew.',
    pros: ['Manually vetted listings', 'No spam', 'Long-running brand'],
    cons: ['Expensive in Naira (~₦37k/mo)', 'US/UK-only focus', 'No AI tools'],
  },
  {
    slug: 'weworkremotely',
    name: 'We Work Remotely',
    oneLiner: 'Flat-fee employer posts, established remote board — high traffic, no filtering.',
    pros: ['High brand recognition', 'Big traffic to listings', 'Free for seekers'],
    cons: ['No filtering by region', 'No application tracker', 'No AI tools'],
  },
  {
    slug: 'remoteok',
    name: 'RemoteOK',
    oneLiner: 'Aggregator + paid posts, popular with devs — fast UI, lots of volume.',
    pros: ['Huge volume', 'Fast interface', 'Dev-focused'],
    cons: ['Heavy spam', 'No African pricing', 'No application tracker', 'Mixed quality'],
  },
  {
    slug: 'indeed',
    name: 'Indeed',
    oneLiner: 'Generic mega job board — most listings, but few are truly remote-friendly.',
    pros: ['Largest catalogue', 'Free to apply', 'Universal recognition'],
    cons: ['Lots of fake-remote listings', 'No remote filtering at signup', 'No AI tools'],
  },
  {
    slug: 'wellfound',
    name: 'Wellfound',
    oneLiner: 'Startup-focused job board (formerly AngelList Talent) — equity-heavy roles at YC/seed/Series-A companies.',
    pros: ['Startup hiring focus', 'Salary + equity transparency', 'Direct founder messages'],
    cons: ['Heavily US-weighted', 'No African pricing', 'No application tracker', 'Sparse outside SV ecosystem'],
  },
] as const;
