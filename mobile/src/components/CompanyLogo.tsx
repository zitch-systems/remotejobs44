// src/components/CompanyLogo.tsx — a company logo: the real image (expo-image)
// when the job has a logoUrl, otherwise the gradient initial tile. Seed jobs
// have no logoUrl, so demo mode keeps the gradient tiles.
import React from 'react';
import { Image } from 'expo-image';
import type { Job } from '@/lib/types';
import { radii } from '@/theme';
import { LogoTile } from './ui';

export function CompanyLogo({
  job,
  size = 40,
  radius = radii.logo,
}: {
  job: Pick<Job, 'logo' | 'grad' | 'logoUrl'>;
  size?: number;
  radius?: number;
}) {
  if (job.logoUrl) {
    return (
      <Image
        source={{ uri: job.logoUrl }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#fff' }}
        contentFit="contain"
        transition={120}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return <LogoTile initial={job.logo} grad={job.grad} size={size} radius={radius} />;
}
