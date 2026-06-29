import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CV Builder',
  description: 'Build an ATS-ready remote CV with a live preview and an ATS score.',
  robots: { index: false, follow: false },
};

export default function CvLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
