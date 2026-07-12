'use client';
// components/jobs/CompanyMask.tsx
//
// Client-side visual mask for the employer name on shared/static surfaces
// (home-page featured/live feeds, dashboard recommendations, SEO slice
// listings) whose HTML is rendered once for everyone. The real name stays
// in the SSR'd markup — stripping it there would make crawlers index
// "Hidden Company" as the employer on pages we WANT ranking for employer
// queries — and a CSS blur is applied on hydration unless the local auth
// state says the viewer is a subscriber.
//
// Policy: the company name is a subscriber feature. Only Pro (monthly /
// annual) and admin reveal; anonymous, free, and Day Pass viewers all see
// the blur. (The /jobs/[id] detail page enforces the same rule server-side
// via canSeeCompanyName + lib/jobs/company-mask.ts and no longer uses this
// component — per-request rendering lets it withhold the name entirely.)
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function CompanyMask({ company }: { company: string }) {
  const user = useAuthStore(s => s.user);
  const plan = user?.plan ?? 'free';

  const blurred = !user || plan === 'free' || plan === 'daily';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 transition-[filter] duration-150',
        blurred && 'blur-[4px] select-none'
      )}
      aria-hidden={blurred || undefined}
    >
      {company}
    </span>
  );
}
