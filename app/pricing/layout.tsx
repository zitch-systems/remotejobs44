import type { Metadata } from 'next';

// /pricing is a client component (interactive plan toggles), so it can't
// export metadata itself — this server layout supplies it. Without it the
// page inherited only the generic root title despite being in sitemap.ts.
export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Affordable access to 70,000+ remote jobs — grab a Day Pass from ₦500 or go Pro for unlimited one-click applications, AI tools, and job alerts.',
  alternates: { canonical: 'https://remotejobs44.com/pricing' },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
