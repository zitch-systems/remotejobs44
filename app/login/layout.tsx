import type { Metadata } from 'next';

// /login is a client component so it can't export metadata itself — this
// server layout supplies the robots directive (same pattern as /pricing).
// Auth/utility pages are deliberately noindex: they're excluded from the
// sitemap for exactly that reason (see the note in app/sitemap.ts), but
// without this they inherited the root layout's index:true default.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
