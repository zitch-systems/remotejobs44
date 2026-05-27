// lib/seo-slices.ts
// Catalogue of "slices" the SEO landing pages cover. Each slice maps a slug
// (the URL piece) to a label + a PostgREST filter description. The generated
// listing pages (/jobs/category/[slug] etc.) use this to fetch matching jobs
// and to render seo-friendly titles + descriptions.

export const CATEGORIES = [
  { slug: 'engineering', label: 'Engineering',     blurb: 'Remote software, backend, frontend, devops, and infrastructure jobs.' },
  { slug: 'design',      label: 'Design',          blurb: 'Remote UX, UI, product, and visual design roles.' },
  { slug: 'marketing',   label: 'Marketing',       blurb: 'Remote growth, content, SEO, and brand marketing jobs.' },
  { slug: 'finance',     label: 'Finance',         blurb: 'Remote finance, accounting, and FP&A roles.' },
  { slug: 'sales',       label: 'Sales',           blurb: 'Remote AE, SDR, BDR, and account-management roles.' },
  { slug: 'data',        label: 'Data & Analytics',blurb: 'Remote data science, analytics, and ML jobs.' },
  { slug: 'hr',          label: 'HR & People',     blurb: 'Remote recruiting, people ops, and HR jobs.' },
  { slug: 'product',     label: 'Product',         blurb: 'Remote product manager, product owner, and PM roles.' },
  { slug: 'legal',       label: 'Legal',           blurb: 'Remote legal counsel, compliance, and paralegal jobs.' },
  { slug: 'operations',  label: 'Operations',      blurb: 'Remote ops, customer success, and program management roles.' },
] as const;

export const COUNTRIES = [
  { slug: 'nigeria',       label: 'Nigeria',        blurb: 'Remote roles open to Nigerian applicants worldwide.' },
  { slug: 'south-africa',  label: 'South Africa',   blurb: 'Remote roles open to South African applicants worldwide.' },
  { slug: 'kenya',         label: 'Kenya',          blurb: 'Remote roles open to Kenyan applicants worldwide.' },
  { slug: 'ghana',         label: 'Ghana',          blurb: 'Remote roles open to Ghanaian applicants worldwide.' },
  { slug: 'egypt',         label: 'Egypt',          blurb: 'Remote roles open to Egyptian applicants worldwide.' },
  { slug: 'morocco',       label: 'Morocco',        blurb: 'Remote roles open to Moroccan applicants worldwide.' },
  { slug: 'rwanda',        label: 'Rwanda',         blurb: 'Remote roles open to Rwandan applicants worldwide.' },
  { slug: 'uganda',        label: 'Uganda',         blurb: 'Remote roles open to Ugandan applicants worldwide.' },
  { slug: 'india',         label: 'India',          blurb: 'Remote roles open to Indian applicants worldwide.' },
  { slug: 'philippines',   label: 'Philippines',    blurb: 'Remote roles open to Filipino applicants worldwide.' },
  { slug: 'pakistan',      label: 'Pakistan',       blurb: 'Remote roles open to Pakistani applicants worldwide.' },
  { slug: 'brazil',        label: 'Brazil',         blurb: 'Remote roles open to Brazilian applicants worldwide.' },
  { slug: 'mexico',        label: 'Mexico',         blurb: 'Remote roles open to Mexican applicants worldwide.' },
  { slug: 'argentina',     label: 'Argentina',      blurb: 'Remote roles open to Argentine applicants worldwide.' },
  { slug: 'worldwide',     label: 'Worldwide',      blurb: 'Fully-remote jobs open to candidates anywhere on Earth.' },
  // Expanded country catalogue
  { slug: 'tunisia',       label: 'Tunisia',        blurb: 'Remote roles open to Tunisian applicants worldwide.' },
  { slug: 'algeria',       label: 'Algeria',        blurb: 'Remote roles open to Algerian applicants worldwide.' },
  { slug: 'senegal',       label: 'Senegal',        blurb: 'Remote roles open to Senegalese applicants worldwide.' },
  { slug: 'ethiopia',      label: 'Ethiopia',       blurb: 'Remote roles open to Ethiopian applicants worldwide.' },
  { slug: 'ivory-coast',   label: 'Ivory Coast',    blurb: 'Remote roles open to Ivorian applicants worldwide.' },
  { slug: 'tanzania',      label: 'Tanzania',       blurb: 'Remote roles open to Tanzanian applicants worldwide.' },
  { slug: 'zimbabwe',      label: 'Zimbabwe',       blurb: 'Remote roles open to Zimbabwean applicants worldwide.' },
  { slug: 'zambia',        label: 'Zambia',         blurb: 'Remote roles open to Zambian applicants worldwide.' },
  { slug: 'cameroon',      label: 'Cameroon',       blurb: 'Remote roles open to Cameroonian applicants worldwide.' },
  { slug: 'botswana',      label: 'Botswana',       blurb: 'Remote roles open to Botswanan applicants worldwide.' },
  { slug: 'mauritius',     label: 'Mauritius',      blurb: 'Remote roles open to Mauritian applicants worldwide.' },
  { slug: 'usa',           label: 'United States',  blurb: 'Remote roles open to United States-based applicants.' },
  { slug: 'uk',            label: 'United Kingdom', blurb: 'Remote roles open to UK-based applicants.' },
  { slug: 'canada',        label: 'Canada',         blurb: 'Remote roles open to Canadian applicants.' },
  { slug: 'germany',       label: 'Germany',        blurb: 'Remote roles open to German-based applicants.' },
] as const;

export const SKILLS = [
  { slug: 'react',         label: 'React',          blurb: 'Remote React engineering and frontend jobs.' },
  { slug: 'typescript',    label: 'TypeScript',     blurb: 'Remote TypeScript engineering roles, frontend and backend.' },
  { slug: 'node',          label: 'Node.js',        blurb: 'Remote Node.js backend and full-stack engineering jobs.' },
  { slug: 'python',        label: 'Python',         blurb: 'Remote Python engineering, data, and ML roles.' },
  { slug: 'django',        label: 'Django',         blurb: 'Remote Django backend engineering jobs.' },
  { slug: 'rails',         label: 'Rails',          blurb: 'Remote Ruby on Rails engineering jobs.' },
  { slug: 'go',            label: 'Go',             blurb: 'Remote Golang engineering jobs.' },
  { slug: 'rust',          label: 'Rust',           blurb: 'Remote Rust systems engineering jobs.' },
  { slug: 'java',          label: 'Java',           blurb: 'Remote Java backend and platform engineering jobs.' },
  { slug: 'kotlin',        label: 'Kotlin',         blurb: 'Remote Kotlin Android and backend engineering jobs.' },
  { slug: 'swift',         label: 'Swift',          blurb: 'Remote iOS / Swift engineering jobs.' },
  { slug: 'flutter',       label: 'Flutter',        blurb: 'Remote Flutter mobile engineering jobs.' },
  { slug: 'react-native',  label: 'React Native',   blurb: 'Remote React Native mobile engineering jobs.' },
  { slug: 'devops',        label: 'DevOps',         blurb: 'Remote DevOps, SRE, and platform engineering jobs.' },
  { slug: 'aws',           label: 'AWS',            blurb: 'Remote AWS cloud engineering and architecture jobs.' },
  { slug: 'kubernetes',    label: 'Kubernetes',     blurb: 'Remote Kubernetes / container platform engineering jobs.' },
  { slug: 'terraform',     label: 'Terraform',      blurb: 'Remote Terraform / IaC platform engineering jobs.' },
  { slug: 'sql',           label: 'SQL',            blurb: 'Remote SQL, database, and analytics-engineering jobs.' },
  { slug: 'postgres',      label: 'Postgres',       blurb: 'Remote Postgres / PostgreSQL backend and DBA jobs.' },
  { slug: 'figma',         label: 'Figma',          blurb: 'Remote Figma-centric product and UX design jobs.' },
  { slug: 'seo',           label: 'SEO',            blurb: 'Remote SEO and organic-growth marketing jobs.' },
  { slug: 'content',       label: 'Content',        blurb: 'Remote content writer, editor, and strategist jobs.' },
  { slug: 'copywriting',   label: 'Copywriting',    blurb: 'Remote copywriting and conversion-writing jobs.' },
  { slug: 'sales-dev',     label: 'Sales Dev',      blurb: 'Remote sales development and BDR jobs.' },
  // Expanded skill catalogue for SEO breadth
  { slug: 'vue',           label: 'Vue.js',         blurb: 'Remote Vue.js frontend engineering jobs.' },
  { slug: 'angular',       label: 'Angular',        blurb: 'Remote Angular frontend engineering jobs.' },
  { slug: 'svelte',        label: 'Svelte',         blurb: 'Remote Svelte / SvelteKit frontend engineering jobs.' },
  { slug: 'nextjs',        label: 'Next.js',        blurb: 'Remote Next.js / React full-stack engineering jobs.' },
  { slug: 'nestjs',        label: 'NestJS',         blurb: 'Remote NestJS / Node.js backend engineering jobs.' },
  { slug: 'fastapi',       label: 'FastAPI',        blurb: 'Remote FastAPI / Python backend engineering jobs.' },
  { slug: 'scala',         label: 'Scala',          blurb: 'Remote Scala / JVM backend and data engineering jobs.' },
  { slug: 'elixir',        label: 'Elixir',         blurb: 'Remote Elixir / Phoenix backend engineering jobs.' },
  { slug: 'csharp',        label: 'C# / .NET',      blurb: 'Remote C# and .NET engineering jobs.' },
  { slug: 'ruby',          label: 'Ruby',           blurb: 'Remote Ruby backend engineering jobs.' },
  { slug: 'php',           label: 'PHP',            blurb: 'Remote PHP / Laravel backend engineering jobs.' },
  { slug: 'graphql',       label: 'GraphQL',        blurb: 'Remote GraphQL API engineering jobs.' },
  { slug: 'mongodb',       label: 'MongoDB',        blurb: 'Remote MongoDB backend and data engineering jobs.' },
  { slug: 'redis',         label: 'Redis',          blurb: 'Remote Redis / caching backend engineering jobs.' },
  { slug: 'docker',        label: 'Docker',         blurb: 'Remote Docker / container platform engineering jobs.' },
  { slug: 'gcp',           label: 'GCP',            blurb: 'Remote Google Cloud Platform engineering jobs.' },
  { slug: 'azure',         label: 'Azure',          blurb: 'Remote Azure cloud engineering jobs.' },
  { slug: 'data-engineering',label: 'Data Engineering', blurb: 'Remote data engineering, ETL, and warehousing jobs.' },
  { slug: 'machine-learning',label: 'Machine Learning', blurb: 'Remote machine learning and applied-AI engineering jobs.' },
  { slug: 'cybersecurity', label: 'Cybersecurity',  blurb: 'Remote security engineering, AppSec, and infosec jobs.' },
] as const;

export const TIMEZONES = [
  { slug: 'wat',  label: 'West Africa Time (WAT, UTC+1)',  blurb: 'Remote jobs that overlap with West African business hours.' },
  { slug: 'eat',  label: 'East Africa Time (EAT, UTC+3)',  blurb: 'Remote jobs that overlap with East African business hours.' },
  { slug: 'sast', label: 'South Africa Time (SAST, UTC+2)', blurb: 'Remote jobs that overlap with South African business hours.' },
  { slug: 'gmt',  label: 'GMT / UTC',                       blurb: 'Remote jobs operating on GMT / UTC schedules.' },
  { slug: 'cet',  label: 'Central European Time (CET, UTC+1)', blurb: 'Remote jobs that overlap with CET business hours.' },
  { slug: 'est',  label: 'US Eastern (EST, UTC-5)',         blurb: 'Remote jobs that overlap with US East Coast hours.' },
  { slug: 'pst',  label: 'US Pacific (PST, UTC-8)',         blurb: 'Remote jobs that overlap with US West Coast hours.' },
] as const;

export const REGIONS = [
  { slug: 'africa',         label: 'Africa',            blurb: 'Remote roles welcoming candidates from across Africa.' },
  { slug: 'europe',         label: 'Europe',            blurb: 'Remote roles welcoming candidates from across Europe.' },
  { slug: 'americas',       label: 'Americas',          blurb: 'Remote roles welcoming candidates from across the Americas.' },
  { slug: 'asia',           label: 'Asia',              blurb: 'Remote roles welcoming candidates from across Asia.' },
  { slug: 'middle-east',    label: 'Middle East',       blurb: 'Remote roles welcoming candidates from the Middle East.' },
  { slug: 'worldwide',      label: 'Worldwide',         blurb: 'Fully-remote roles open to candidates anywhere.' },
] as const;

export function findCategory(slug: string)  { return CATEGORIES.find(c => c.slug === slug); }
export function findCountry(slug: string)   { return COUNTRIES.find(c => c.slug === slug); }
export function findSkill(slug: string)     { return SKILLS.find(c => c.slug === slug); }
export function findTimezone(slug: string)  { return TIMEZONES.find(c => c.slug === slug); }
export function findRegion(slug: string)    { return REGIONS.find(c => c.slug === slug); }
