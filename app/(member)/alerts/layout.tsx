import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Alerts',
  description: 'Your job-match alerts, application updates and system notifications.',
  robots: { index: false, follow: false },
};

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
