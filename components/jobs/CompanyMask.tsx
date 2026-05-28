'use client';
// components/jobs/CompanyMask.tsx
//
// Visually hides the company name for free / not-yet-applied day-pass users
// WITHOUT stripping it from the server-rendered HTML. The previous client-
// only page rendered the literal string "Hidden Company" into the DOM for
// unauthenticated visitors, meaning crawlers + Bing/Perplexity/ClaudeBot
// indexed "Hidden Company" as the employer — a self-inflicted SEO wound.
//
// Here the real company name is always in the SSR'd HTML (and in the
// JobPosting JSON-LD); we only apply a CSS blur filter on hydration when
// the local Zustand auth state says the user shouldn't see it yet.
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function CompanyMask({
  company,
  revealedToDailyOnApply = false,
}: {
  company: string;
  revealedToDailyOnApply?: boolean;
}) {
  const user = useAuthStore(s => s.user);
  const isLoggedIn = !!user;
  const plan = user?.plan ?? 'free';

  const blurredForFree  = !isLoggedIn || plan === 'free';
  const blurredForDaily = plan === 'daily' && !revealedToDailyOnApply;
  const blurred = blurredForFree || blurredForDaily;

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
