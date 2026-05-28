// components/jobs/SourceTrustBadge.tsx
//
// Tiny pill rendering the source-trust tier (Verified ATS / Aggregator /
// Unverified). Server-renderable; no client state. Tooltip via `title=`
// so it works without JS — full description on hover.
import { CheckCircle2, Globe2, AlertTriangle } from 'lucide-react';
import { getSourceTrust, describeSourceTrust } from '@/lib/source-trust';
import { cn } from '@/lib/utils';

const TONE_CLASSES: Record<'green' | 'blue' | 'stone', string> = {
  green: 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 border-brand-200 dark:border-brand-800',
  blue:  'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  stone: 'bg-stone-50 dark:bg-[#162033] text-stone-500 dark:text-stone-400 border-stone-200 dark:border-[#1e3a5f]',
};

export function SourceTrustBadge({
  source,
  size = 'md',
}: {
  source: string | null | undefined;
  size?: 'sm' | 'md';
}) {
  const trust = getSourceTrust(source);
  const meta  = describeSourceTrust(trust);

  const Icon = trust === 'verified'   ? CheckCircle2
             : trust === 'aggregator' ? Globe2
             : AlertTriangle;

  const sizeClasses = size === 'sm'
    ? 'text-[10px] px-1.5 py-0.5 gap-0.5'
    : 'text-xs px-2 py-1 gap-1';
  const iconClasses = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <span
      title={meta.tooltip}
      className={cn(
        'inline-flex items-center rounded-full border font-bold',
        sizeClasses,
        TONE_CLASSES[meta.tone],
      )}
    >
      <Icon className={iconClasses} />
      {meta.label}
    </span>
  );
}
