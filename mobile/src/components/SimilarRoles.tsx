// src/components/SimilarRoles.tsx — "Similar roles" list for the job detail.
// Live: other active jobs in the same category. Demo: from the seed set.
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Job } from '@/lib/types';
import { fetchSimilarJobs } from '@/lib/jobs';
import { isUsdSalary } from '@/lib/format';
import { SEED_JOBS } from '@/lib/seed';
import { isSupabaseConfigured } from '@/lib/supabase';
import { radii, spacing, useTheme } from '@/theme';
import { CompanyLogo } from './CompanyLogo';
import { Pill, Txt } from './ui';

export function SimilarRoles({ job }: { job: Job }) {
  const { colors } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<Job[]>([]);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) {
      setItems(SEED_JOBS.filter((j) => j.category === job.category && j.id !== job.id).slice(0, 4));
      return;
    }
    fetchSimilarJobs(job.category, job.id)
      .then((j) => active && setItems(j))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [job.id, job.category]);

  if (items.length === 0) return null;

  return (
    <View style={{ gap: spacing[3] }}>
      <Txt variant="h3" color={colors.fg1}>
        Similar roles
      </Txt>
      <View style={{ gap: spacing[2] }}>
        {items.map((j) => (
          <Pressable
            key={j.id}
            onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[3],
                padding: spacing[3],
                borderRadius: radii.field,
                borderWidth: 1.5,
                borderColor: colors.border1,
                backgroundColor: colors.bgCard,
              },
              pressed && { transform: [{ scale: 0.99 }] },
            ]}
          >
            <CompanyLogo job={j} size={36} />
            <View style={{ flex: 1 }}>
              <Txt variant="cardTitle" color={colors.fg1} numberOfLines={1}>
                {j.role}
              </Txt>
              <Txt variant="meta" color={colors.fg3} numberOfLines={1}>
                {j.company}
                {isUsdSalary(j.salary) ? ` · ${j.salary}${j.per}` : ''}
              </Txt>
            </View>
            <Pill label={`${j.match}%`} bg={colors.successBg} fg={colors.successText} border={colors.successBorder} small />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
