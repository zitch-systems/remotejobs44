// app/jobs/[id]/layout.tsx — server component, handles SEO metadata
import type { Metadata } from 'next';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.vercel.app';

export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  // Fetch job data server-side for accurate OG tags
  try {
    const res = await fetch(`${BASE}/api/jobs?id=${params.id}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      const job = data.job;
      if (job) {
        const title  = `${job.title} at ${job.company}`;
        const desc   = `${job.location} · ${job.type} · ${job.category}. Apply now on RemoteJobs44.`;
        const ogUrl  = `${BASE}/api/og?title=${encodeURIComponent(job.title)}&company=${encodeURIComponent(job.company)}`;
        return {
          title,
          description: desc,
          openGraph: { title, description: desc, images: [{ url: ogUrl, width: 1200, height: 630 }] },
          twitter:    { card: 'summary_large_image', title, description: desc, images: [ogUrl] },
        };
      }
    }
  } catch {}

  return {
    title: 'Remote Job | RemoteJobs44',
    openGraph: { images: [`${BASE}/api/og?title=Remote+Job+Opportunity`] },
  };
}

export default function JobDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
