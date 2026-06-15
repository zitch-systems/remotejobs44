// src/components/RecentlyViewed.tsx — a horizontal strip of jobs the user has
// recently opened (store/recent-jobs). Self-hides when empty.
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Txt } from './ui';
import { CompanyLogo } from './CompanyLogo';
import { useRecentJobs } from '@/store/recent-jobs';
import type { RecentJob } from '@/lib/recent';
import { fonts, spacing, useTheme } from '@/theme';

function RecentCard({ job, onPress }: { job: RecentJob; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${job.role} at ${job.company}`}
      style={({ pressed }) => [pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <Card style={{ width: 188, padding: spacing[3], gap: spacing[3] }}>
        <CompanyLogo job={job} size={34} />
        <View style={{ gap: 2 }}>
          <Txt variant="cardTitle" color={colors.fg1} numberOfLines={1}>
            {job.role}
          </Txt>
          <Txt variant="meta" color={colors.fg3} numberOfLines={1}>
            {job.company}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Txt style={{ fontFamily: fonts.displayBold, fontSize: 13, color: colors.fg1 }}>{job.salary}</Txt>
          <Txt variant="meta" color={colors.fg4}>
            {job.per}
          </Txt>
        </View>
      </Card>
    </Pressable>
  );
}

export function RecentlyViewed() {
  const { colors } = useTheme();
  const router = useRouter();
  const items = useRecentJobs((s) => s.items);
  const clear = useRecentJobs((s) => s.clear);
  if (items.length === 0) return null;
  return (
    <View style={{ gap: spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt variant="h2">Recently viewed</Txt>
        <Pressable onPress={clear} accessibilityRole="button" accessibilityLabel="Clear recently viewed">
          <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 13, color: colors.brand }}>Clear</Txt>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[3], paddingRight: spacing[2] }}>
        {items.map((j) => (
          <RecentCard key={j.id} job={j} onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })} />
        ))}
      </ScrollView>
    </View>
  );
}
