import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cover Letter Generator',
  description: 'Generate a tailored cover letter for any remote role with tone controls.',
  robots: { index: false, follow: false },
};

export default function CoverLettersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
