import type { Metadata } from 'next';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { normalizeJobDescription } from '@/lib/job-description';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const admin = createAdminSupabaseClient();
    const { data: job } = await admin
      .from('jobs')
      .select('title, company, description, location, category, salary_min, salary_max, currency, logo')
      .eq('id', (await params).id)
      .maybeSingle();

    if (!job) return { title: 'Job Not Found | RemoteJobs44' };

    const title = `${job.title} at ${job.company} | RemoteJobs44`;
    const description = job.description
      ? normalizeJobDescription(job.description).slice(0, 160).replace(/\s+/g, ' ').trim()
      : `Apply for ${job.title} at ${job.company}. Remote job — ${job.location}. Find remote jobs at RemoteJobs44.`;

    const salary = job.salary_min
      ? `${job.currency ?? 'USD'} ${job.salary_min.toLocaleString()}${job.salary_max ? `–${job.salary_max.toLocaleString()}` : '+'}`
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
        // in would leak it to everyone and undercut the paywall. Title + salary
        // still make a compelling card.
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
