import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Job Match',
  description: 'Paste a job description and see how your CV matches its required signals.',
  robots: { index: false, follow: false },
};

export default function MatchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
