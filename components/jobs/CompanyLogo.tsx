'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CompanyLogoProps {
  src?: string | null;
  company: string;
  size: number;
  className?: string;
}

/** Render an externally hosted company mark without routing it through Next's image proxy. */
export function CompanyLogo({ src, company, size, className }: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const imageUrl = typeof src === 'string' && /^https:\/\//i.test(src) ? src : undefined;
  const initials = company.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';

  return (
    <div
      className={cn('shrink-0 rounded-lg bg-stone-100 dark:bg-[#0f1e38] border border-stone-200 dark:border-[#1e3a5f] flex items-center justify-center overflow-hidden text-brand-700 dark:text-brand-400 font-black', className)}
      style={{ width: size, height: size }}
      aria-label={`${company} logo`}
    >
      {imageUrl && !failed ? (
        <Image src={imageUrl} alt={`${company} logo`} width={size} height={size} unoptimized className="w-full h-full object-contain" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true" className="text-[0.9em]">{initials}</span>
      )}
    </div>
  );
}
