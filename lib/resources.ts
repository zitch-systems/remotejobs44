// lib/resources.ts — Catalogue of long-form articles served at /resources and
// /resources/[slug]. Each article is a self-contained guide with sections.

export interface Article {
  slug: string;
  title: string;
  description: string;
  category: 'getting-started' | 'salary' | 'tools' | 'country-guide' | 'interview' | 'cv' | 'remote-life' | 'skills';
  readMinutes: number;
  updated: string; // ISO date
  sections: { heading: string; body: string }[];
}

const _U = '2026-05-25';

export const ARTICLES: Article[] = [
  {
    slug: 'remote-work-101-for-africans',
    title: 'Remote Work 101 for Africans: A No-Fluff Starter Guide',
    description: 'The honest, end-to-end starter guide for getting your first global remote job from Lagos, Nairobi, Cape Town, Accra, or anywhere else in Africa.',
    category: 'getting-started', readMinutes: 9, updated: _U,
    sections: [
      { heading: 'Who actually hires remotely from Africa?', body: 'Most fully-remote startups will hire from Africa if you can prove output, communicate clearly in English, and overlap a few hours with their core timezone. Stripe, GitLab, Automattic, Toptal, Andela, Deel, Remote.com, and hundreds of YC-funded startups hire engineers and designers from Africa every month. Marketing, content, customer success, and operations roles are the most accessible if you don’t come from a CS background.' },
      { heading: 'What makes you stand out', body: 'Three things move the needle: (1) a working portfolio or GitHub profile that shows shipped work, not just listed skills, (2) clear written English in your CV and cover letter, (3) a one-paragraph summary at the top of your CV that says exactly what role you want and why you’re a good fit. Recruiters skim — make their job easy.' },
      { heading: 'Timezone strategy', body: 'WAT (UTC+1) overlaps with London mornings (UTC+0/+1) and German afternoons. EAT (UTC+3) overlaps with London afternoons. Both can hit US East Coast morning hours (UTC-5) for 2–3 productive hours. Be specific in your application: "I can do 9am–1pm EST daily" is more persuasive than "flexible hours."' },
      { heading: 'How to get paid', body: 'Wise (TransferWise), Geegpay, Grey, Chipper Cash, and Payoneer are the standard rails for receiving USD/GBP/EUR into Nigerian, Kenyan, or South African accounts. For salaried roles, Deel and Remote.com handle payroll, contracts, and benefits — you just give them your local bank details.' },
      { heading: 'Your first 30 days', body: '1) Pick one role you want (e.g. "frontend engineer"). 2) Update your CV to that role specifically. 3) Apply to 5 roles per day for 14 days from RemoteJobs44 with a Day Pass. 4) Iterate on what gets responses. Most people fail because they apply to one role per week with a generic CV.' },
    ],
  },
  {
    slug: 'remote-developer-salary-guide-africa',
    title: 'Remote Developer Salary Guide for Africa (2026)',
    description: 'What Nigerian, Kenyan, South African, Ghanaian, and Egyptian developers actually get paid in USD by remote-first companies — by role and seniority.',
    category: 'salary', readMinutes: 7, updated: _U,
    sections: [
      { heading: 'Junior developer (0–2 yrs)', body: 'Junior remote engineers from Africa typically earn $1,500–$3,500/month USD at a global startup. African-only outsourcers (Andela, Tunga, Decagon) often pay less but provide structured onboarding. Self-applying to a global startup pays more if your portfolio is solid.' },
      { heading: 'Mid-level (2–5 yrs)', body: 'Mid-level engineers from Africa working remotely earn $3,500–$7,000/month USD. The range depends mostly on the company’s base location: US-headquartered startups pay top of that range, EU startups slightly less, Asia and Middle East variable.' },
      { heading: 'Senior (5+ yrs)', body: 'Senior engineers from Africa at remote-first US startups earn $7,000–$15,000/month USD. Staff and Principal roles can hit $200k/yr. The ceiling is set by how the company benchmarks — many remote-first companies (GitLab, Buffer) publish a global pay formula; some pay close to US local.' },
      { heading: 'Adjacent roles', body: 'Senior product designer: $4,000–$10,000/mo. Marketing manager: $2,500–$6,000/mo. Sales (AE) with commission: $40k–$120k OTE/yr. Customer success: $1,800–$4,500/mo. Data engineer: similar to backend engineer.' },
      { heading: 'How to negotiate as an African', body: 'Anchor on your USD number, not your local equivalent. "I’m targeting $5,500/month" is a clear ask. If they push back with a regional discount, ask for the exact formula they use and where you fall on it. Many will simply pay closer to US local if you’re confident and well-prepared.' },
    ],
  },
  {
    slug: 'top-tools-for-remote-african-job-seekers',
    title: '15 Free Tools Every Remote Job Seeker in Africa Should Use',
    description: 'CV builders, ATS scanners, cold-email tools, payment rails, and productivity stacks — the actually-free toolkit for remote job hunters.',
    category: 'tools', readMinutes: 6, updated: _U,
    sections: [
      { heading: 'CV builder & ATS check', body: 'FlowCV (free) and Resume.io (limited free) generate clean, ATS-friendly CVs. JobScan (3 free scans/mo) tells you which keywords from a job description are missing from your CV — fixing those alone usually doubles response rate.' },
      { heading: 'Cold email', body: 'Hunter.io (25 free searches/mo) finds verified emails by company domain. Lemlist and Mailshake have free trials. For one-off outreach, just use Gmail with a clear subject line and a 4-line message — over-engineered "sequences" backfire.' },
      { heading: 'Job alerts & aggregators', body: 'RemoteJobs44 (us, free to browse), Remotive, Jobicy, Working Nomads, and Himalayas cover most of the global remote-first market. LinkedIn’s "Remote" filter is still very useful for senior roles.' },
      { heading: 'Payments', body: 'Wise, Grey, Geegpay, Chipper Cash, and Payoneer for receiving USD/GBP/EUR. For salaried roles, Deel and Remote handle full payroll. Bitnob and Yellow Card are useful as on/off-ramps if you hold crypto.' },
      { heading: 'Productivity', body: 'Notion (free) for tracking applications and prep. Loom (free) for async video answers in interviews — many remote-first companies prefer this over live calls. Cron.com for global timezone coordination.' },
    ],
  },
  {
    slug: 'how-to-pass-a-remote-technical-interview',
    title: 'How to Pass a Remote Technical Interview',
    description: 'Why most candidates fail technical screens at remote startups, and the structured prep that fixes it.',
    category: 'interview', readMinutes: 8, updated: _U,
    sections: [
      { heading: 'What they’re really testing', body: 'Remote technical interviews test three things, in order of importance: (1) can you communicate your thinking clearly while typing, (2) do you write code that’s correct under simple inputs, (3) can you handle a follow-up that changes the problem. Speed matters less than clarity.' },
      { heading: 'The 4-step framework', body: 'Restate the problem. Walk through an example by hand. Outline your approach in plain English BEFORE coding. Then code, talking through what you’re doing. Stop and test against your example. This sequence alone outscores most candidates.' },
      { heading: 'System design', body: 'For senior roles you’ll get an open-ended design (e.g. "design a URL shortener"). Anchor on requirements first ("how many users, how many writes/sec?"). Pick one storage + one cache + one queue. Be honest about trade-offs. Don’t cargo-cult AWS service names.' },
      { heading: 'Behavioural', body: 'STAR format: Situation, Task, Action, Result — but skip Situation if it’s obvious. The interviewer cares about Action and Result. Have 4 strong stories memorised: a conflict, a failure you owned, a leadership moment, a time you made a hard trade-off.' },
      { heading: 'Async / Loom interviews', body: 'Several remote-first companies (Buffer, Automattic, GitLab) replace live screens with Loom video answers. Treat these as your audition: rehearse once, record once, ship. Length: 2–3 minutes per answer. Look at the camera, not the screen.' },
    ],
  },
  {
    slug: 'write-a-cv-that-passes-ats',
    title: 'Write a CV That Passes ATS (Applicant Tracking Systems)',
    description: 'The exact CV structure that gets through Greenhouse, Lever, Ashby, and Workable — and the keyword optimisation that beats most applicants.',
    category: 'cv', readMinutes: 5, updated: _U,
    sections: [
      { heading: 'The ATS-friendly format', body: 'Single column. Standard section headers ("Experience", "Education", "Skills"). No tables, no text boxes, no graphics. Send as PDF (not Word). 1–2 pages max. Filename: "Firstname Lastname CV.pdf".' },
      { heading: 'The keyword game', body: 'Copy the job description into a tool like JobScan or just compare manually: every required skill that you genuinely have should appear once in your Summary AND once in your Experience bullets. Don’t keyword-stuff — ATS scoring is dumb but recruiters read after.' },
      { heading: 'Bullets that work', body: 'Verb + what you did + measurable outcome. "Migrated billing pipeline from REST to gRPC, cutting p95 latency from 800ms to 110ms" beats "Worked on backend systems." If you don’t have a metric, pick a meaningful proxy ("for 12 internal teams" / "across 3 product areas").' },
      { heading: 'Summary section', body: 'Two-line summary at the top: who you are + what you want. "Senior backend engineer with 6 yrs in payments — currently building Stripe-like infra for African fintech. Looking for fully-remote senior role in fintech or developer tools." Recruiters read this first.' },
      { heading: 'What to cut', body: 'Drop: objective statements, photos, "references available on request", every skill you saw on a course but never used. Recruiters spend 30 seconds — cutting noise wins.' },
    ],
  },
  {
    slug: 'remote-jobs-nigeria-2026',
    title: 'Remote Jobs in Nigeria: 2026 Playbook',
    description: 'Where Nigerian remote workers actually land jobs, how much they earn, and what trips most applicants.',
    category: 'country-guide', readMinutes: 7, updated: _U,
    sections: [
      { heading: 'Where the demand is', body: 'Engineering, design, sales development, content, and customer success are the highest-demand remote categories for Nigerian applicants. YC-backed US startups, EU SaaS scale-ups, and Africa-focused fintechs (Flutterwave, Paystack, Kuda, Moniepoint) all hire actively.' },
      { heading: 'Pay benchmarks', body: 'Junior dev: ₦400k–₦1.4M/mo. Mid: ₦1.5M–₦4M/mo. Senior: ₦4M–₦12M/mo. Roles paid in USD trend higher. Salary at African-only outsourcers is typically half of what direct-application to a US startup pays.' },
      { heading: 'Practical setup', body: 'Get a Wise/Grey/Geegpay USD account. Set your laptop to UTC+1. Use a power bank for inverter outages. Test your Zoom/Slack on mobile data so you can run a 30-min interview through any blackout.' },
      { heading: 'Most common mistakes', body: 'Applying with a Nigerian-format CV (don’t — use the international 1-page format). Hiding your location ("I’m based in Lagos" is a feature, not a bug, if you frame timezone overlap). Ignoring follow-up emails — most offers come after one or two follow-ups.' },
    ],
  },
  {
    slug: 'remote-jobs-kenya-2026',
    title: 'Remote Jobs in Kenya: 2026 Playbook',
    description: 'The realistic guide to landing a global remote job from Nairobi or anywhere in Kenya.',
    category: 'country-guide', readMinutes: 6, updated: _U,
    sections: [
      { heading: 'The Kenya advantage', body: 'EAT (UTC+3) overlaps with London afternoons and EU mornings, plus a productive 2 hours with US East Coast mornings. English-first market, strong M-Pesa rails, growing tech ecosystem (Twiga, Cellulant, Sendy).' },
      { heading: 'Hot categories', body: 'Engineering, data analytics, customer success, fintech-adjacent roles. Many global fintechs (Stripe, Mercury, Plaid-equivalents) hire Kenyan developers for African market expertise.' },
      { heading: 'Pay benchmarks', body: 'Junior dev: KES 80k–250k/mo. Mid: 250k–700k/mo. Senior: 700k–1.8M+/mo. USD-denominated roles typically pay 2× equivalent Kenyan salary.' },
      { heading: 'Tools that work', body: 'Wise + M-Pesa for receiving and using USD locally. Deel/Remote for salaried roles. Apply through RemoteJobs44, Brighter Monday, and direct YC company listings.' },
    ],
  },
  {
    slug: 'remote-jobs-south-africa-2026',
    title: 'Remote Jobs in South Africa: 2026 Playbook',
    description: 'How South African remote workers compete with global talent and win.',
    category: 'country-guide', readMinutes: 6, updated: _U,
    sections: [
      { heading: 'Market overview', body: 'Cape Town, Joburg, and Durban have mature tech scenes. SAST (UTC+2) overlaps perfectly with EU business hours. English is dominant in professional contexts. Pay expectations are higher than other African countries, which can be a bargaining strength.' },
      { heading: 'Hot categories', body: 'Engineering (senior backend, devops), data science, product management, and B2B SaaS sales/CS. Yoco, Stitch, Lulalend, and global SaaS scale-ups hire actively.' },
      { heading: 'Pay benchmarks', body: 'Junior dev: ZAR 25k–55k/mo. Mid: 55k–110k/mo. Senior: 110k–250k+/mo. USD-denominated roles add 30–80% premium.' },
      { heading: 'Local edge', body: 'EU-aligned timezone, mature financial system (FNB, Standard Bank handle USD wires cleanly), strong written English. Lean into EU job markets where SAST is a strict advantage.' },
    ],
  },
  {
    slug: 'remote-jobs-ghana-2026',
    title: 'Remote Jobs in Ghana: 2026 Playbook',
    description: 'A focused guide for Ghanaian remote workers — categories, pay, and the practical setup.',
    category: 'country-guide', readMinutes: 6, updated: _U,
    sections: [
      { heading: 'Ghana’s remote opportunity', body: 'GMT (UTC+0) is the perfect timezone for working with London, Lisbon, and EU mornings — and you get 5+ hours of overlap with US East Coast. English-speaking, stable internet in Accra and Kumasi.' },
      { heading: 'Hot categories', body: 'Engineering, content/copywriting, customer success, fintech operations. African fintechs (Hubtel, ExpressPay, Zeepay) and global SaaS hire actively.' },
      { heading: 'Pay benchmarks', body: 'Junior dev: GHS 4k–12k/mo. Mid: 12k–28k/mo. Senior: 28k–70k+/mo. USD-denominated roles pay 2–3× equivalent local salary.' },
      { heading: 'Payment rails', body: 'Wise + Mobile Money is the standard. Many companies use Deel or Remote for salaried roles. Geegpay supports GHS payouts directly.' },
    ],
  },
  {
    slug: 'avoiding-remote-job-scams',
    title: 'How to Avoid Remote Job Scams (and Spot Real Ones)',
    description: 'Telltale signs of fake remote job ads, common scam patterns, and the quick checks that protect your time and money.',
    category: 'getting-started', readMinutes: 5, updated: _U,
    sections: [
      { heading: 'Red flags', body: 'Asks you to pay anything (training, equipment, "certification") — always a scam. Hiring without an interview. Pays via gift cards or crypto only. Job ad has no company name or links to a Gmail address. Pressure to start "today."' },
      { heading: 'Quick verification checks', body: 'Search the company name + "Glassdoor" and + "LinkedIn". Real companies have profiles. Check their domain on a WHOIS — newly registered domains are suspect. Match the recruiter name against LinkedIn — fake recruiters often have empty profiles.' },
      { heading: 'Equipment scams', body: 'Common pattern: company "hires" you, mails a check to buy a laptop from "their preferred vendor", check bounces after you’ve sent money. Never accept a payment before you’ve started work. Real companies ship equipment themselves.' },
      { heading: 'Aggregator hygiene', body: 'On RemoteJobs44, every paid-Day-Pass apply link is to a real company application page or apply email. We pull from public APIs (Remotive, RemoteOK, Arbeitnow, Working Nomads, Himalayas) and direct ATS feeds. If a posting looks off, the apply link will tell you — real companies use Greenhouse, Lever, Ashby, or Workable URLs.' },
    ],
  },
  {
    slug: 'building-a-portfolio-without-a-cs-degree',
    title: 'Building a Portfolio Without a CS Degree',
    description: 'The 3-project portfolio that gets you hired as a self-taught remote engineer.',
    category: 'skills', readMinutes: 6, updated: _U,
    sections: [
      { heading: 'Why 3 projects beats 30', body: 'Hiring managers spend 90 seconds on a portfolio. Three well-shipped projects — each with a problem statement, the trade-offs you made, and a live demo — beat 30 tutorial clones every time.' },
      { heading: 'Project 1: A real tool you use', body: 'Build something you actually need (a habit tracker, a focused-work timer, a meal planner). Ship it. Get 5 real users. Write up what broke. This proves you can finish.' },
      { heading: 'Project 2: Re-implement something famous', body: 'Build a slimmed-down clone of a known product (a tiny Twitter, a tiny Discord channel, a 100-line jobs board). The point isn’t the clone — it’s your README explaining what you simplified and why.' },
      { heading: 'Project 3: Contribute to open source', body: 'Find a real OSS project. Fix a "good first issue". Get the PR merged. Link to it. This proves you can work in a real codebase under review.' },
      { heading: 'How to present', body: 'A simple portfolio site (Notion or Astro) with: each project’s problem, your role, screenshots, GitHub link, live demo. Don’t list every language you’ve touched — list the 3 things you’re actually good at.' },
    ],
  },
  {
    slug: 'cover-letter-template-that-works',
    title: 'A Cover Letter Template That Actually Works for Remote Roles',
    description: 'Five-paragraph structure that gets responses — with three example openings tailored to remote-first hiring.',
    category: 'cv', readMinutes: 4, updated: _U,
    sections: [
      { heading: 'The 5-paragraph structure', body: '1) One-line hook: why you, why this role. 2) One concrete result you’ve shipped that proves you can do the job. 3) Why this company specifically (not generic). 4) Your remote-readiness: timezone, communication, async habits. 5) Clear ask: a 15-min call, or "happy to start with a paid trial task."' },
      { heading: 'Opening lines that work', body: '"I’ve shipped 3 production GraphQL APIs in the last 18 months — your job description reads like exactly the kind of work I want to keep doing." Versus: "I am writing to apply for the position of…". The first signals you read the JD; the second signals a copy-paste.' },
      { heading: 'What to skip', body: 'Skip: your full work history (that’s the CV). Generic "I’m a hard worker." Anything you can’t back up. References to your degree if you’re self-taught — your portfolio is the proof.' },
      { heading: 'Length', body: '250 words max. Recruiters read in 30 seconds. If they care after that, they’ll open the CV.' },
    ],
  },
  {
    slug: 'time-zones-and-remote-overlap',
    title: 'Time Zones: How Africans Use Overlap as a Hiring Advantage',
    description: 'Why "I overlap 4 hours with your team" is a stronger opening than "flexible hours" — and how to position it.',
    category: 'remote-life', readMinutes: 4, updated: _U,
    sections: [
      { heading: 'Why overlap matters', body: 'Remote-first companies care about how many hours per day you can be on the same Slack thread as the people who need you. A genuine 4-hour overlap with a US East Coast team is worth more than 8 hours of solo work at 3am.' },
      { heading: 'Africa\'s overlap map', body: 'WAT/UTC+1 → London (full day), EU (5 hrs), NYC (3 hrs morning). EAT/UTC+3 → London (5 hrs afternoon), EU (4 hrs), NYC (2 hrs morning). SAST/UTC+2 → identical to CET, full EU day overlap, partial NYC.' },
      { heading: 'How to position', body: 'In your CV/intro: "Based in Lagos (UTC+1). Comfortable on EU schedule; can do daily 9am–1pm EST core hours." That’s a clear ask. Don’t say "flexible" — that signals you don’t want to commit.' },
      { heading: 'When the timezone is wrong', body: 'If the role needs PST overlap and you’re in EAT, don’t pretend. Either skip the role or propose a specific schedule ("I’d do 4pm–10pm EAT to overlap your morning"). Honesty wins.' },
    ],
  },
  {
    slug: 'how-to-ask-for-a-raise-as-a-remote-worker',
    title: 'How to Ask for a Raise as a Remote Worker',
    description: 'The conversation script, evidence to bring, and the three traps to avoid when you’re asking for more money remotely.',
    category: 'remote-life', readMinutes: 5, updated: _U,
    sections: [
      { heading: 'Build the case first', body: 'Three things: (1) the scope that grew since you joined, (2) shipped outcomes with metrics, (3) the market rate for your role in the company’s base region. The third is the leverage; the first two are the warmup.' },
      { heading: 'The conversation', body: 'Don’t ambush. Email your manager: "I’d like to discuss compensation in our next 1:1." Bring a 1-pager. Lead with: "Here’s the scope that’s grown, here’s the value, and here’s what the market pays for it. I’d like to move to $X."' },
      { heading: 'Avoid these traps', body: '1) Comparing to a coworker — never works. 2) Threatening to quit if you’re not ready to. 3) Accepting "let me check" without a date. Always end with: "Can we agree on a decision date?"' },
      { heading: 'If they say no', body: 'Get the specific reason. If it’s budget, ask when the next cycle is. If it’s performance, get the gap defined. If you still want the raise after that, start interviewing — having a competing offer changes the conversation faster than any other lever.' },
    ],
  },
  {
    slug: 'remote-work-equipment-essentials',
    title: 'Remote Work Equipment: The Essentials, the Nice-to-Haves',
    description: 'What you actually need to do remote work professionally from Africa — and what’s overhyped.',
    category: 'remote-life', readMinutes: 5, updated: _U,
    sections: [
      { heading: 'Non-negotiable', body: 'A laptop that doesn’t die mid-call. A USB-C power bank or inverter to cover 2-hour outages. A backup mobile data plan. A wired headset (Anker SoundCore Life Q20 or any $40 noise-cancelling — your voice clarity matters more than your audio).' },
      { heading: 'Worth the spend', body: 'External monitor (any 24" 1080p — productivity jumps 2×). Ergonomic chair (any office chair under $150). Webcam if your laptop’s is bad (Logitech C270 is $30 and fine). A surge protector — Nigerian and Ghanaian outages will fry your laptop charger if you don’t.' },
      { heading: 'Overhyped', body: 'Standing desks, 4K monitors, mechanical keyboards (unless you genuinely prefer them), DSLR-as-webcam setups, designer chair brands. Buy them if you want — they won’t make you employable.' },
      { heading: 'Internet', body: 'Two ISPs. Even Starlink users in Africa still need a 4G/5G backup for the 3% of the time it’s down. MTN, Airtel, Safaricom, Vodacom — pick the strongest in your area and pair it with a different provider for redundancy.' },
    ],
  },
  {
    slug: 'best-async-companies-hiring-remotely',
    title: 'Best Async-First Companies Hiring Remotely (And How to Get In)',
    description: 'Companies where written work beats meetings — perfect if you’re hiring from Africa and need timezone freedom.',
    category: 'remote-life', readMinutes: 5, updated: _U,
    sections: [
      { heading: 'What async-first means', body: 'Less than 5 hours of meetings per week. Most decisions happen in writing (Notion, Linear, Slack threads). You’re evaluated on shipped output, not face time. These are the companies where an African timezone is least limiting.' },
      { heading: 'Companies that are genuinely async', body: 'Automattic, GitLab, Buffer, Doist, Zapier, Posthog, Linear, Plaid (engineering pods), Discourse, Tessian. Many YC-backed remote-first startups also operate this way — check their hiring page for "async" mentions.' },
      { heading: 'How to apply', body: 'Async-first companies love written interviews and Loom video answers. Treat every application as a chance to show your written thinking — a paragraph in your cover letter that explains *how* you’d ramp into the role often outperforms a polished CV.' },
      { heading: 'How they evaluate', body: 'Expect: a written take-home task, an async Loom intro, then maybe 1–2 live calls. The "test" is whether you can finish good work without supervision and write up your thinking clearly. Practice that — it’s exactly what the job is.' },
    ],
  },
  {
    slug: 'side-projects-that-get-noticed',
    title: 'Side Projects That Get You Noticed by Remote Hiring Managers',
    description: 'Five side-project archetypes that consistently lead to inbound recruiter messages — and the ones that don’t.',
    category: 'skills', readMinutes: 5, updated: _U,
    sections: [
      { heading: '1. A tool that helps the community you’re in', body: 'A Telegram bot for your industry, a CSV parser for a niche workflow, a Chrome extension for a tool you use daily. These rank high on Google long-tail searches and show product instincts. Examples: a Stripe receipt cleaner, a JD-to-CV matcher.' },
      { heading: '2. An open-source library', body: 'Build a small, well-scoped npm or pip package that solves one specific problem. README is the product. Twitter / Hacker News announce. Even 200 GitHub stars opens doors — hiring managers Google your name and find it.' },
      { heading: '3. A weekly blog or newsletter', body: 'One technical write-up per week on what you’re learning, for 3 months. By month 3 you’ll have 10–15 posts, recruiters Google your name and read them, and your written communication is on display.' },
      { heading: '4. Reimplementing the thing they sell', body: 'Hiring at Stripe? Build a tiny Stripe-like checkout. Hiring at Linear? Build a tiny Linear-like board. Send your demo in the application. Bold but it gets responses.' },
      { heading: 'What doesn’t work', body: 'Yet-another-todo-app. Yet-another-twitter-clone. Empty GitHub repos full of tutorial copies. Five unfinished half-projects. One shipped, used, written-up project beats five half-built ones every time.' },
    ],
  },
  {
    slug: 'learning-roadmap-frontend-2026',
    title: '2026 Frontend Engineer Learning Roadmap (Africa Edition)',
    description: 'A focused, no-fluff roadmap to becoming a hireable remote frontend engineer in 6 months.',
    category: 'skills', readMinutes: 7, updated: _U,
    sections: [
      { heading: 'Month 1–2: Foundations', body: 'HTML, CSS, modern JavaScript (ES2024). Build 5 layouts from a Figma file. Learn Flexbox + Grid until you can lay anything out from scratch in 10 minutes. Output: a personal site that doesn’t look templated.' },
      { heading: 'Month 3: React + TypeScript', body: 'React fundamentals, hooks, context, simple state. TypeScript basics: types, generics, narrowing. Build a CRUD app with React Query and a real API (Supabase free tier). Ship it.' },
      { heading: 'Month 4: Next.js + Tailwind', body: 'App router, server components, server actions. Tailwind for everything. Build a mini "Hacker News" or "Indiehackers" clone. Deploy to Vercel. This is also when you start contributing to one open-source Next.js project.' },
      { heading: 'Month 5: Performance, testing, accessibility', body: 'Lighthouse 95+, basic React Testing Library, ARIA. These are the things that separate "knows React" from "can ship to production". Add tests to your earlier project. Refactor it for performance.' },
      { heading: 'Month 6: Apply', body: 'Polish portfolio. Apply to 5 remote roles per day for 30 days from RemoteJobs44 with a Day Pass. Track what gets responses. Iterate. The act of applying is itself the last 5% of training.' },
    ],
  },
  {
    slug: 'learning-roadmap-backend-2026',
    title: '2026 Backend Engineer Learning Roadmap (Africa Edition)',
    description: 'The condensed 6-month path to a remote backend engineering job in 2026.',
    category: 'skills', readMinutes: 7, updated: _U,
    sections: [
      { heading: 'Month 1–2: Language + databases', body: 'Pick ONE backend stack — Python/Django, Node/Express, Go, or Java/Spring. Stop comparing. Learn SQL deeply: joins, indexes, EXPLAIN. Build a CRUD API talking to Postgres. Hand-write the migrations.' },
      { heading: 'Month 3: HTTP fundamentals + auth', body: 'REST conventions, HTTP semantics, idempotency. Build a real auth system with email + password (yes, even though Supabase exists — you need to understand the bits before you use the abstraction).' },
      { heading: 'Month 4: Production concerns', body: 'Logging, error handling, retries, idempotency keys, rate limiting. Build a project that calls an external API (Stripe, OpenAI, Paystack) and handle every failure gracefully. This is the work backend engineers actually do.' },
      { heading: 'Month 5: Infrastructure', body: 'Docker, one cloud provider end-to-end (AWS or Fly.io or Railway), a CI pipeline. Deploy your project. Add monitoring (Sentry free tier). Add a Postgres backup cron.' },
      { heading: 'Month 6: System design + apply', body: 'Read Designing Data-Intensive Applications (chapters 1–5). Apply to 5 remote roles/day. Track. Iterate. By the end of month 6 you should be passing first-round technical screens.' },
    ],
  },
  {
    slug: 'product-designer-remote-portfolio-guide',
    title: 'Product Designer Remote Portfolio Guide (2026)',
    description: 'What remote-first companies want to see in a product designer portfolio — and the 4 case-study structure that wins interviews.',
    category: 'skills', readMinutes: 6, updated: _U,
    sections: [
      { heading: 'What hiring managers skim for', body: 'In order: (1) thought process per case study, (2) before/after screens, (3) measurable impact, (4) the breadth of problem types you’ve worked on. Pretty visuals are table stakes — the writing carries you.' },
      { heading: 'The 4-section case study', body: 'PROBLEM (what you were asked to solve and for whom). PROCESS (research, alternatives considered, why you killed the rejected ones). SOLUTION (the design, but more importantly the constraints). IMPACT (numbers if you have them, narrative if you don’t).' },
      { heading: 'Tools they expect', body: 'Figma is mandatory in 2026. Add basic FigJam for workshops. Familiarity with Notion, Linear, and one analytics tool (Posthog, Mixpanel, Amplitude) is a plus. Coding skills (HTML/CSS/React basics) double your callback rate at engineering-heavy startups.' },
      { heading: 'Where to land your portfolio', body: 'Custom Notion / Framer / Astro site. Personal domain. Three case studies minimum, six maximum. Each case study readable in under 4 minutes.' },
    ],
  },
  {
    slug: 'data-analyst-remote-roadmap',
    title: 'Remote Data Analyst Career Roadmap',
    description: 'How to build the analytics-engineering portfolio that wins remote data roles in 2026.',
    category: 'skills', readMinutes: 6, updated: _U,
    sections: [
      { heading: 'The required stack', body: 'SQL (mandatory, deep). Python + Pandas. One BI tool (Looker, Metabase, or Tableau). Git. dbt if you’re aiming for analytics engineering specifically.' },
      { heading: 'Three portfolio projects', body: '1) A SQL deep-dive: pick a public dataset (Spotify, NYC Taxi, GitHub Archive), answer 5 non-trivial questions, write up findings. 2) A dashboard built end-to-end on real data. 3) A dbt model that transforms raw data into clean analytics tables — with tests.' },
      { heading: 'How to differentiate', body: 'Write up your work. Most analysts post screenshots. The ones who write *why* a chart is interesting and what the next question would be — they get hired. A weekly Substack of analytics breakdowns is a hiring magnet.' },
      { heading: 'Job titles to apply to', body: 'Data Analyst (entry to mid). Analytics Engineer (mid+). Marketing/Product/Growth Analyst (specialist tracks). Business Intelligence Developer (more enterprise). All hire remotely.' },
    ],
  },
  {
    slug: 'sales-development-remote-jobs-from-africa',
    title: 'Sales Development (SDR/BDR) Remote Jobs from Africa',
    description: 'A path into US-startup sales as a remote African — what the role really is, and the skills that get hired.',
    category: 'skills', readMinutes: 5, updated: _U,
    sections: [
      { heading: 'What an SDR actually does', body: 'Cold email + cold call + LinkedIn outreach to schedule discovery calls for Account Executives. It’s a numbers game with a writing skill — you’re evaluated on calls booked per week, not closed deals.' },
      { heading: 'Skills that matter', body: 'Clear written English. Comfort with rejection. Salesforce / HubSpot / Outreach / Apollo / Lemlist. Research speed: can you find a prospect’s pain point in 90 seconds? Voice clarity for cold calls.' },
      { heading: 'Pay structure', body: 'Base $30k–$60k/yr + commission $20k–$60k/yr. Top SDRs at well-funded startups OTE $80k–$120k. African remote SDRs typically earn slightly below US local but well above local market.' },
      { heading: 'How to break in', body: 'Build a portfolio of cold email templates you’ve written (the company doesn’t exist yet — just write them). Make a Loom of you giving a 60-second cold call pitch. Apply to YC-backed SaaS startups specifically — they hire SDRs constantly.' },
    ],
  },
  {
    slug: 'customer-success-remote-jobs-from-africa',
    title: 'Customer Success Remote Jobs from Africa: The Realistic Guide',
    description: 'Customer Success Manager (CSM) roles are one of the most accessible remote categories — here’s how to land one.',
    category: 'skills', readMinutes: 5, updated: _U,
    sections: [
      { heading: 'What a CSM actually does', body: 'You\'re a customer’s assigned point of contact after sale. You drive adoption, do quarterly business reviews, handle escalations, and (most importantly) prevent churn. Metric: net revenue retention.' },
      { heading: 'Why it’s accessible', body: 'Most CSM job descriptions list "3+ years in a customer-facing role" — that includes support, account management, even teaching. If you have strong written English and product instincts, the bar is lower than engineering.' },
      { heading: 'Tools to learn', body: 'Gainsight, ChurnZero, HubSpot, Intercom, Notion. Most of these have free trials. Sit through 1–2 hours of YouTube tutorials per tool until you can talk about them confidently in interviews.' },
      { heading: 'Where to apply', body: 'Mid-stage B2B SaaS startups ($5M–$50M ARR) hire most aggressively. Browse RemoteJobs44 with category=operations or search "customer success" — there are dozens of openings most weeks.' },
    ],
  },
  {
    slug: 'content-marketing-remote-jobs-africa',
    title: 'Content Marketing Remote Jobs: The Africa Guide',
    description: 'Content writer, SEO writer, content strategist — what remote-first companies pay for and how to position yourself.',
    category: 'skills', readMinutes: 5, updated: _U,
    sections: [
      { heading: 'The 3 archetypes', body: 'Content WRITER (per-post or per-word, $200–$1000/article). Content STRATEGIST (salaried, $40k–$120k/yr, owns calendar + briefs + analytics). SEO WRITER (specialised; $500–$2000/article, ranks for keywords). Strategist is most stable income.' },
      { heading: 'Portfolio basics', body: '6–10 published pieces (your own blog or other publications). At least 2 with measurable results (traffic, leads, conversions). A 1-page case study of your best piece including the brief, your process, and the outcome.' },
      { heading: 'How to land your first paid gig', body: 'Cold email 10 marketing managers/week with a personalised pitch: "I read [their recent piece], I noticed [specific gap], here’s a 200-word outline of what I’d write to fill it." Convert 1 in 20 to a paid trial. From there it compounds.' },
      { heading: 'Tools to know', body: 'Ahrefs / SEMrush (paid but free trials), Surfer SEO, ChatGPT/Claude as a research assistant (not a writer), Grammarly, Notion or Google Docs. Don’t use AI to write the actual articles — clients spot it and you lose the gig.' },
    ],
  },
  {
    slug: 'how-to-write-a-loom-video-application',
    title: 'How to Write a Loom Video Application That Beats Live Interviews',
    description: 'Async-first companies use Loom screenings instead of live calls. Here’s how to nail the 2-minute video that gets you to the next round.',
    category: 'interview', readMinutes: 4, updated: _U,
    sections: [
      { heading: 'The structure that works', body: '0:00–0:15 — name, role you’re applying for, why. 0:15–1:15 — one specific shipped outcome from your CV in plain English. 1:15–1:45 — why this company specifically (be detailed). 1:45–2:00 — what you’d like to discuss next. Total: 2 minutes, max 3.' },
      { heading: 'Filming tips', body: 'Webcam at eye level. Natural light from in front. Wired headset. Plain background. Stand if you can — energy translates. Rehearse once, record once, ship. If your second take isn’t way better, ship the first.' },
      { heading: 'What to avoid', body: 'Reading from a script (sounds robotic). Going over 3 minutes. Apologising for "not being prepared". Excessive background music. Filters or visual effects.' },
      { heading: 'When to use Loom unprompted', body: 'If you’re cold-applying and want to stand out, attach a 90-second Loom intro to your application. Many hiring managers say it’s the #1 thing that gets a CV moved from "no" to "let’s chat."' },
    ],
  },
  {
    slug: 'remote-work-from-africa-tax-basics',
    title: 'Tax Basics for Remote Workers in Africa',
    description: 'A practical, non-accountant intro to taxes when you’re earning USD remotely from Nigeria, Kenya, Ghana, or South Africa.',
    category: 'remote-life', readMinutes: 6, updated: _U,
    sections: [
      { heading: 'Disclaimer', body: 'This is not tax advice. Tax law changes. Hire an accountant who knows your country’s rules once you’re earning over $1500/mo regularly.' },
      { heading: 'The general principle', body: 'You owe tax in the country where you are tax-resident. For most Africans that means your home country. If you work for a US/EU company, they typically do NOT withhold tax — you do.' },
      { heading: 'Nigeria', body: 'Register a business (small business registration is easy) — paying yourself a salary as a business is often cleaner than personal income tax on freelance earnings. Talk to a chartered accountant before you make $5k/mo.' },
      { heading: 'Kenya, Ghana, South Africa', body: 'Each has a turnover-based tax for freelancers + a personal income tax bracket. The threshold for hiring an accountant is roughly the same: once you’re earning USD consistently, it’s worth $50/mo to keep your filings clean.' },
      { heading: 'Common mistakes', body: 'Not filing because "they won’t know" — your bank does report to tax authorities, eventually. Mixing personal and business accounts. Assuming your US employer’s 1099 covers you — it doesn’t.' },
    ],
  },
  {
    slug: 'remote-internships-from-africa',
    title: 'Remote Internships for Students and Early-Career Workers in Africa',
    description: 'Where to find real, paid remote internships — and the application strategy that gets shortlisted.',
    category: 'getting-started', readMinutes: 5, updated: _U,
    sections: [
      { heading: 'Where the openings are', body: 'YC startups (most have summer/winter cohorts), Toptal Academy, Andela Learning, Outreachy (paid OSS internships), Major League Hacking, RemoteJobs44 filtered by level=entry. LinkedIn’s "Internships" filter works if you set location to "Remote".' },
      { heading: 'What to apply with', body: 'A 1-page CV (even if it feels light). A GitHub with 3 projects. A 200-word cover letter that doesn’t say "I’m a fast learner". Mention your timezone clearly.' },
      { heading: 'Compensation expectations', body: 'Paid remote internships from US/EU startups: $1k–$3k/mo. Outreachy: $7k stipend. Free internships exist but rarely lead to full-time offers — prioritize paid ones even if pay is low.' },
      { heading: 'Conversion to full-time', body: 'Show up on time every day. Ask before asking again. Write end-of-week summaries unprompted. Most full-time offers from internships go to the person who needed the least handholding.' },
    ],
  },
  {
    slug: 'first-100-days-at-a-new-remote-job',
    title: 'Your First 100 Days at a New Remote Job',
    description: 'The 4-phase playbook for ramping into a remote role faster than your peers — and the mistakes that quietly kill careers.',
    category: 'remote-life', readMinutes: 6, updated: _U,
    sections: [
      { heading: 'Days 1–14: observation', body: 'Don’t suggest changes. Don’t complain about the codebase or process. Map who does what. Read the last 30 days of Slack in your team channels. Set up your local environment. Ship one tiny, obviously-correct PR.' },
      { heading: 'Days 15–45: small wins', body: 'Take on the smallest, highest-confidence work in the backlog. Ship it. Ask for code review carefully. Begin a weekly written summary to your manager: "this week I did X, learned Y, next week I’ll do Z." This habit alone gets people promoted.' },
      { heading: 'Days 46–80: ownership', body: 'Pick one small but real problem nobody owns. Own it. Drive it to done. This is what differentiates you from the median new hire — you stopped waiting to be assigned.' },
      { heading: 'Days 81–100: feedback loop', body: 'Ask your manager directly: "How am I doing? What would you want to see more of?" Be specific in the question. Most managers default to "you’re doing great" — push for the actionable part. Use what you hear.' },
      { heading: 'Quiet career killers', body: 'Not replying to Slack within a workday. Saying "I’ll get to it" without a date. Skipping the weekly company all-hands. Posting too much in #random and too little in your team channel.' },
    ],
  },
  {
    slug: 'remote-work-isolation-and-mental-health',
    title: 'Beating Remote-Work Isolation (Africa Edition)',
    description: 'The honest guide to staying sane and connected when you work from home from Africa for a foreign company.',
    category: 'remote-life', readMinutes: 5, updated: _U,
    sections: [
      { heading: 'Why it’s harder for Africans specifically', body: 'You\'re on a foreign team’s timezone (often 4–8 hours offset), with coworkers you’ve never met, in a country where remote work is still rare so your friends don’t fully get the rhythm. The isolation is real and predictable.' },
      { heading: 'Tactical fixes', body: 'Co-work physically with one other remote worker once a week (most African cities have at least one good co-working space). Schedule one social call per week with someone in your industry. Take a real lunch break OUT of your workspace. Walk outside daily.' },
      { heading: 'Build a small remote community', body: 'African Remote Workers Slack, Devs of Africa, Indie Africans, women-in-tech groups — pick one or two and lurk for a month before participating. These groups give you peers who get the specific weirdness of your situation.' },
      { heading: 'When to call a therapist', body: 'If you’re tired before the workday starts more than 3 days a week, if you’ve stopped enjoying things outside work, or if you’re withdrawing from family — talk to a therapist. Many African cities now have affordable online options (₦15k/session in Lagos, KES 3k in Nairobi).' },
    ],
  },
  {
    slug: 'switching-from-freelance-to-fulltime-remote',
    title: 'Switching from Freelance to a Full-Time Remote Job',
    description: 'When to make the leap, what changes, and how to position your freelance career as an asset on your CV.',
    category: 'getting-started', readMinutes: 5, updated: _U,
    sections: [
      { heading: 'When the switch makes sense', body: 'When your freelance income has been steady but capped. When you want health benefits / equity / a manager. When you’re tired of selling yourself every quarter. When you want one big problem to focus on instead of many small ones.' },
      { heading: 'How to position freelance experience', body: 'Treat your freelance work as employment on your CV. "Independent Engineer, 2022–2026" with bullets on 3–4 named client outcomes (paraphrased if NDAs). Recruiters are more comfortable with this format than "freelancer."' },
      { heading: 'What to expect from the change', body: 'More meetings. Less control over what you build. Slower pace (full-time roles have more dependencies). Better stability, benefits, often higher equity-adjusted compensation. Less ability to take 2 weeks off whenever.' },
      { heading: 'Pitfalls', body: 'Don’t take the first offer just because it’s a job — your alternative (freelancing) is real. Negotiate just as you would client work. Don’t mention freelance "side hustles" in interviews unless asked — most full-time employers want commitment.' },
    ],
  },
];

export function findArticle(slug: string) {
  return ARTICLES.find(a => a.slug === slug);
}
