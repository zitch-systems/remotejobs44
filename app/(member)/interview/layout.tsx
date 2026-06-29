import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Interview',
  description: 'Practice a remote-role mock interview with live, scored feedback.',
  robots: { index: false, follow: false },
};

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
