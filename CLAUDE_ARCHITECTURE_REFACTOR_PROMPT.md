# Claude Code Refactor & Architecture Audit Prompt for RemoteJobs44

You are a principal software architect, senior Next.js engineer, staff frontend engineer, staff backend engineer, DevOps engineer, performance engineer, and technical SEO specialist.

Your task is to perform a complete audit and refactor of the RemoteJobs44 codebase and implement the necessary architectural improvements.

## Project Context

RemoteJobs44 is a global remote jobs marketplace built with:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Shared design tokens
- Authentication
- Search and filtering
- SEO-driven marketplace pages

The product vision is:

> Every genuinely remote job in the world, searchable and verified in one place.

---

## Primary Objective

Transform the current implementation into a production-ready architecture that can scale to:

- 70,000+ jobs
- 150+ countries
- millions of page views
- SEO-first marketplace traffic
- authenticated users
- subscriptions and payments

---

## Phase 1 — Full Repository Audit

Audit and document:

- folder structure
- component architecture
- state management
- API design
- search implementation
- authentication
- database architecture
- performance bottlenecks
- accessibility
- SEO
- security
- deployment setup

Generate:

- ARCHITECTURE_AUDIT.md
- TECHNICAL_DEBT.md
- PERFORMANCE_REPORT.md
- SEO_REPORT.md
- SECURITY_REPORT.md

---

## Phase 2 — Remove Architectural Anti-Patterns

Identify and eliminate:

### 1. God Files

Break apart files such as:

- shared.js
- large page components
- utility dumping grounds

Refactor into:

lib/
  jobs/
  search/
  auth/
  companies/
  theme/
  analytics/

---

### 2. Feature-Based Architecture

Reorganize the application into:

features/
  auth/
  jobs/
  companies/
  search/
  applications/
  subscriptions/

Each feature should contain:

- components
- hooks
- services
- types
- utils
- tests

---

### 3. Domain Models

Create strongly typed domain models:

types/
  job.ts
  company.ts
  user.ts
  auth.ts
  application.ts
  subscription.ts

---

## Phase 3 — Search Architecture

Replace client-side filtering with production search.

Current:

Hero Search
  ↓
Client Filter
  ↓
DOM Updates

Target:

Search UI
  ↓
Server API
  ↓
Database Search
  ↓
SSR Response

Implement:

- server actions
- API routes
- pagination
- faceted search
- full text search
- sorting
- caching

---

## Phase 4 — SEO Architecture

Implement marketplace SEO.

Create:

/jobs/category/[slug]
/jobs/company/[slug]
/jobs/location/[slug]
/jobs/remote-first
/jobs/featured

Implement:

- dynamic metadata
- canonical URLs
- sitemap generation
- robots.txt
- OpenGraph
- Twitter cards
- JSON-LD
- breadcrumbs schema
- job posting schema

Target:

- Core Web Vitals green
- programmatic SEO
- indexable marketplace pages

---

## Phase 5 — Authentication Architecture

Create:

app/(auth)/
  login
  signup
  forgot-password
  reset-password
  verify-email

Implement:

- Google OAuth
- GitHub OAuth
- email authentication
- session management
- middleware protection
- RBAC

---

## Phase 6 — Database Architecture

Design production schema:

users
companies
jobs
job_categories
saved_jobs
applications
saved_searches
alerts
subscriptions
payments

Create indexes for:

- title
- company
- category
- location
- featured
- created_at
- full text search

---

## Phase 7 — Performance

Optimize:

- live market wall
- logo marquees
- animations
- image loading
- bundle size
- server components
- caching
- virtualization

Requirements:

- Lighthouse > 90
- First Load JS minimized
- zero layout shifts

---

## Phase 8 — Testing

Create:

tests/
  unit/
  integration/
  e2e/

Implement:

- Vitest
- Playwright
- accessibility tests
- API tests
- auth tests
- search tests

---

## Final Deliverables

Produce:

1. Refactored architecture
2. Migration plan
3. Before/after diagrams
4. Performance benchmarks
5. SEO benchmarks
6. Security audit
7. Production readiness score
8. Prioritized task list:

- Critical
- High
- Medium
- Low

Do not merely recommend improvements.

Implement the fixes directly in the repository while preserving existing functionality and UI fidelity.