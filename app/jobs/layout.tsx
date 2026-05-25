import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Browse Remote Jobs | RemoteJobs44',
  description: 'Search 50,000+ remote jobs in engineering, design, marketing, finance and more. Filter by category, type, salary, and region. Apply from Nigeria and Africa.',
  keywords: ['remote jobs', 'work from home jobs', 'remote jobs Nigeria', 'remote jobs Africa', 'online jobs', 'telecommute jobs', 'remote engineering jobs', 'remote design jobs'],
  openGraph: {
    title: 'Browse 50,000+ Remote Jobs | RemoteJobs44',
    description: 'Find remote jobs from top global companies. Filter by category, salary, region. Subscribe from ₦500.',
    url: 'https://remotejobs44.com/jobs',
    images: [{ url: '/api/og', width: 1200, height: 630 }],
  },
  alternates: { canonical: 'https://remotejobs44.com/jobs' },
};

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
