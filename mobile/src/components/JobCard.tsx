// src/components/JobCard.tsx — the feed job card (handoff §2 "Job Card").
import React from 'react';
import { type DimensionValue, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BadgeCheck, Bookmark } from 'lucide-react-native';
import type { Job } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { radii, spacing, useTheme } from '@/theme';
import { Card, Pill, Txt } from './ui';
import { CompanyLogo } from './CompanyLogo';

/** Placeholder card shown while live jobs load. */
export function JobCardSkeleton() {
  const { colors } = useTheme();
  const Block = ({ w, h, r = 6 }: { w: DimensionValue; h: number; r?: number }) => (
    <View style={{ width: w, height: h, borderRadius: r, backgroundColor: colors.bgSection }} />
  );
  return (
    <Card style={{ padding: spacing[4], gap: spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Block w={40} h={40} r={radii.logo} />
        <View style={{ flex: 1, gap: 6 }}>
          <Block w="60%" h={12} />
          <Block w="40%" h={10} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Block w={54} h={18} r={999} />
        <Block w={54} h={18} r={999} />
      </View>
    </Card>
  );
}

export function JobCard({ job }: { job: Job }) {
  const { colors } = useTheme();
  const router = useRouter();
  const saved = useAppStore((s) => s.saved.includes(job.id));
  const toggleSaved = useAppStore((s) => s.toggleSaved);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
      style={({ pressed }) => [pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <Card style={{ padding: spacing[4], gap: spacing[3] }}>
        {/* Top row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
          <CompanyLogo job={job} size={40} />
          <View style={{ flex: 1 }}>
            <Txt variant="cardTitle" color={colors.fg1} numberOfLines={1}>
              {job.role}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Txt variant="meta" color={colors.fg3} numberOfLines={1} style={{ flexShrink: 1 }}>
                {job.company}
              </Txt>
              {job.verified ? <BadgeCheck size={14} color={colors.success} /> : null}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: spacing[2] }}>
            <Pill
              label={`${job.match}% match`}
              bg={colors.successBg}
              fg={colors.successText}
              border={colors.successBorder}
              small
            />
            <Pressable
              hitSlop={8}
              onPress={() => toggleSaved(job.id)}
              style={({ pressed }) => [{ padding: 2 }, pressed && { transform: [{ scale: 0.9 }] }]}
            >
              <Bookmark
                size={20}
                color={saved ? colors.accent : colors.fg4}
                fill={saved ? colors.accent : 'transparent'}
              />
            </Pressable>
          </View>
        </View>

        {/* Tags */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {job.tags.map((t) => (
            <Pill
              key={t.label}
              label={t.label}
              small
              bg={t.variant === 'blue' ? colors.infoBg : colors.bgSection}
              fg={t.variant === 'blue' ? colors.infoText : colors.fg2}
            />
          ))}
        </View>

        {/* Footer */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: spacing[3],
            borderTopWidth: 1,
            borderTopColor: colors.border3,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
            <Txt style={{ fontSize: 13 }} variant="cardTitle" color={colors.fg1}>
              {job.salary}
            </Txt>
            <Txt variant="meta" color={colors.fg4}>
              {job.per}
            </Txt>
          </View>
          <Txt variant="meta" color={colors.fg4}>
            {job.time}
          </Txt>
        </View>
      </Card>
    </Pressable>
  );
}
