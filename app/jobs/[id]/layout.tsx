import type { Metadata } from 'next';
import { normalizeJobDescription } from '@/lib/job-description';
import { getJobDetailRow, getExpiredJobMeta } from '@/lib/jobs/job-detail';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    // Shared cached fetch (lib/jobs/job-detail) — the page body reuses the
    // same row via React cache(), so metadata no longer costs a second
    // Supabase round-trip per request.
    const id = (await params).id;
    const job = await getJobDetailRow(id);

    if (!job) {
      // Distinguish a closed posting from a genuine 404 so the <head> matches
      // the body the page renders. Either way the page must NOT be indexed:
      // an expired role gets a noindex "position closed" page (Google's
      // recommended treatment for expired JobPostings), and a missing id 404s.
      const expired = await getExpiredJobMeta(id);
      if (expired) {
        return {
          title: `${expired.title}${expired.company ? ` at ${expired.company}` : ''} — Position Closed | RemoteJobs44`,
          description: 'This role is no longer accepting applications. Browse thousands of live remote jobs on RemoteJobs44.',
          robots: { index: false, follow: true },
          alternates: { canonical: `https://remotejobs44.com/jobs/${id}` },
        };
      }
      return { title: 'Job Not Found | RemoteJobs44', robots: { index: false, follow: true } };
    }

    const title = `${job.title} at ${job.company} | RemoteJobs44`;
    const description = job.description
      ? normalizeJobDescription(job.description).slice(0, 160).replace(/\s+/g, ' ').trim()
      : `Apply for ${job.title} at ${job.company}. Remote job — ${job.location}. Find remote jobs at RemoteJobs44.`;

    // Only US-dollar pay goes on the share card (product rule). Build a
    // '$'-prefixed label so the /api/og route — which renders salary only when
    // it starts with '$' — accepts it; non-USD rows resolve to '' and are dropped.
    const salary = ((job.currency ?? 'USD') === 'USD' && job.salary_min)
      ? `$${job.salary_min.toLocaleString()}${job.salary_max ? `–${job.salary_max.toLocaleString()}` : '+'}`
      : '';

    return {
      title,
      description,
      keywords: [job.title, job.company, 'remote job', 'work from home', job.location, job.category].filter(Boolean),
      openGraph: {
        title,
        description,
        type: 'article',
        url: `https://remotejobs44.com/jobs/${(await params).id}`,
        // Company name is intentionally omitted from the share image. The OG
        // PNG is a single public asset cached for a year and fetched by social
        // crawlers with no auth context, so it can't honour the free/day-pass
        // company blur the way the on-page UI does — baking the real employer
        // in would leak it to everyone and undercut the paywall. Title + (USD)
        // salary still make a compelling card.
        images: [{ url: `/api/og?title=${encodeURIComponent(job.title)}&salary=${encodeURIComponent(salary)}`, width: 1200, height: 630 }],
      },
      twitter: { card: 'summary_large_image', title, description },
      alternates: { canonical: `https://remotejobs44.com/jobs/${(await params).id}` },
    };
  } catch {
    return { title: 'Remote Job | RemoteJobs44' };
  }
}

export default function JobLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
