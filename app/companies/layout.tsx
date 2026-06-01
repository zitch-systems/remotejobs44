import type { Metadata } from 'next';

// /companies (the index) is a client component, so metadata lives here.
// The per-company /companies/[slug] pages set their own via
// generateMetadata, which overrides these defaults for that segment.
export const metadata: Metadata = {
  title: 'Remote Companies Hiring',
  description: 'Browse remote-first companies hiring worldwide on RemoteJobs44 and explore their open roles.',
  alternates: { canonical: 'https://remotejobs44.com/companies' },
};

export default function CompaniesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
