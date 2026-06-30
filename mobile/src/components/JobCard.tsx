// src/components/JobCard.tsx — the feed job card (handoff §2 "Job Card").
// Memoised (see export below): the feed FlatList re-renders on every search
// keystroke / store change, and without memo every mounted card re-ran its
// mount animation and rebuilt its subtree. `job` references are stable across
// parent renders, so React.memo's shallow compare skips untouched rows.
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BadgeCheck, Bookmark } from 'lucide-react-native';
import type { Job } from '@/lib/types';
import { isUsdSalary } from '@/lib/format';
import { useAppStore } from '@/store/app';
import { fonts, spacing, useTheme } from '@/theme';
import { Card, Pill, Txt } from './ui';
import { CompanyLogo } from './CompanyLogo';

function JobCardImpl({ job }: { job: Job }) {
  const { colors } = useTheme();
  const router = useRouter();
  const saved = useAppStore((s) => s.saved.includes(job.id));
  const toggleSaved = useAppStore((s) => s.toggleSaved);

  // Subtle fade + rise as the card mounts (incl. as it scrolls into view).
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [enter]);

  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
    <Pressable
      onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${job.role} at ${job.company}, ${job.match}% match${isUsdSalary(job.salary) ? `, ${job.salary}${job.per ? ' ' + job.per : ''}` : ''}`}
      accessibilityHint="Opens the job details"
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
            {/* §6: match % as bold success-coloured figure (Sora 800, 14px). */}
            <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 14, lineHeight: 18, color: colors.success }}>
              {job.match}%
            </Txt>
            <Pressable
              hitSlop={8}
              onPress={() => toggleSaved(job.id)}
              accessibilityRole="button"
              accessibilityLabel={saved ? `Remove ${job.role} from saved` : `Save ${job.role}`}
              accessibilityState={{ selected: saved }}
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
          {isUsdSalary(job.salary) ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
              <Txt style={{ fontSize: 13 }} variant="cardTitle" color={colors.fg1}>
                {job.salary}
              </Txt>
              <Txt variant="meta" color={colors.fg4}>
                {job.per}
              </Txt>
            </View>
          ) : (
            <View />
          )}
          <Txt variant="meta" color={colors.fg4}>
            {job.time}
          </Txt>
        </View>
      </Card>
    </Pressable>
    </Animated.View>
  );
}

export const JobCard = React.memo(JobCardImpl);
