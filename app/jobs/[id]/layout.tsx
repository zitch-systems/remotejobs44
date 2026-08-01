import type { Metadata } from 'next';
import { normalizeJobDescription } from '@/lib/job-description';
import { getJobDetailRow, getExpiredJobMeta, getRequesterPlanCached } from '@/lib/jobs/job-detail';
import { canSeeCompanyName } from '@/lib/auth/requester-plan';
import { scrubCompanyIdentity } from '@/lib/jobs/company-mask';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    // Shared cached fetch (lib/jobs/job-detail) — the page body reuses the
    // same row via React cache(), so metadata no longer costs a second
    // Supabase round-trip per request. The plan lookup is request-deduped
    // the same way: the employer name is a subscriber (Pro monthly/annual)
    // feature, and the <title>/description/keywords used to hand it to
    // every visitor's browser tab regardless of the on-page mask.
    const id = (await params).id;
    const [job, requesterPlan] = await Promise.all([
      getJobDetailRow(id),
      getRequesterPlanCached(),
    ]);
    const showCompany = canSeeCompanyName(requesterPlan);

    if (!job) {
      // Distinguish a closed posting from a genuine 404 so the <head> matches
      // the body the page renders. Either way the page must NOT be indexed:
      // an expired role gets a noindex "position closed" page (Google's
      // recommended treatment for expired JobPostings), and a missing id 404s.
      const expired = await getExpiredJobMeta(id);
      if (expired) {
        const expTitle = showCompany ? expired.title : scrubCompanyIdentity(expired.title, expired.company);
        return {
          title: `${expTitle}${showCompany && expired.company ? ` at ${expired.company}` : ''} — Position Closed`,
          description: 'This role is no longer accepting applications. Browse thousands of live remote jobs on RemoteJobs44.',
          robots: { index: false, follow: true },
          alternates: { canonical: `https://remotejobs44.com/jobs/${id}` },
        };
      }
      return { title: 'Job Not Found', robots: { index: false, follow: true } };
    }

    // Masked view: the employer must not appear anywhere in <head> — the tab
    // title was the single most visible leak (it named the company for every
    // visitor while the page body blurred it). Scrub the free-text fields
    // too, since scraped titles/descriptions often open with the name.
    const jobTitle = showCompany ? job.title : scrubCompanyIdentity(job.title, job.company);
    const title = showCompany
      ? `${jobTitle} at ${job.company}`
      : `${jobTitle} — Remote Job`;
    const description = job.description
      ? (showCompany
          ? normalizeJobDescription(job.description)
          : scrubCompanyIdentity(normalizeJobDescription(job.description), job.company)
        ).slice(0, 160).replace(/\s+/g, ' ').trim()
      : `Apply for ${jobTitle}${showCompany ? ` at ${job.company}` : ''}. Remote job — ${job.location}. Find remote jobs at RemoteJobs44.`;

    // Only US-dollar pay goes on the share card (product rule). Build a
    // '$'-prefixed label so the /api/og route — which renders salary only when
    // it starts with '$' — accepts it; non-USD rows resolve to '' and are dropped.
    const salary = ((job.currency ?? 'USD') === 'USD' && job.salary_min)
      ? `$${job.salary_min.toLocaleString()}${job.salary_max ? `–${job.salary_max.toLocaleString()}` : '+'}`
      : '';

    return {
      title,
      description,
      keywords: [jobTitle, ...(showCompany ? [job.company] : []), 'remote job', 'work from home', job.location, job.category].filter(Boolean),
      openGraph: {
        title,
        description,
        type: 'article',
        url: `https://remotejobs44.com/jobs/${(await params).id}`,
        // Company name is intentionally omitted from the share image. The OG
        // PNG is a single public asset cached for a year and fetched by social
        // crawlers with no auth context, so it can't honour the subscriber-only
        // company reveal the way the rest of the page now does — baking the
        // real employer in would leak it to everyone and undercut the paywall.
        // Title + (USD) salary still make a compelling card.
        images: [{ url: `/api/og?title=${encodeURIComponent(jobTitle)}&salary=${encodeURIComponent(salary)}`, width: 1200, height: 630 }],
      },
      twitter: { card: 'summary_large_image', title, description },
      alternates: { canonical: `https://remotejobs44.com/jobs/${(await params).id}` },
    };
  } catch {
    return { title: 'Remote Job' };
  }
}

export default function JobLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
