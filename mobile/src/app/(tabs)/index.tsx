// src/app/(tabs)/index.tsx — Home / Match feed (handoff §2).
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Search, SlidersHorizontal } from 'lucide-react-native';
import { Avatar, Card, Chip, Screen, Txt } from '@/components/ui';
import { JobCard } from '@/components/JobCard';
import { SEED_JOBS, SEED_USER } from '@/lib/seed';
import { useAppStore } from '@/store/app';
import { fonts, palette, radii, shadows, spacing, useTheme } from '@/theme';

const FILTERS = ['All', 'Engineering', 'Design', 'Marketing'] as const;

function StatCard({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <Card
      style={{
        flex: 1,
        padding: spacing[3],
        gap: 2,
        ...(accent ? { backgroundColor: colors.warnBg, borderColor: colors.warnBorder } : null),
      }}
    >
      <Txt variant="stat" color={accent ? colors.warnText : colors.fg1}>
        {value}
      </Txt>
      <Txt variant="meta" color={colors.fg3}>
        {label}
      </Txt>
    </Card>
  );
}

function Promo() {
  return (
    <View style={[{ borderRadius: radii.promo, overflow: 'hidden', padding: spacing[5] }, shadows.primary]}>
      <Svg width="100%" height="100%" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="promo" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.brand700} />
            <Stop offset="1" stopColor="#1e3a8a" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#promo)" />
      </Svg>
      <Txt style={{ fontFamily: fonts.displayBold, fontSize: 10.5, letterSpacing: 1, color: 'rgba(255,255,255,0.7)' }}>
        YOUR WEEKLY MATCH
      </Txt>
      <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 18, color: '#fff', marginTop: 6, marginBottom: 4 }}>
        12 new roles fit your profile
      </Txt>
      <Txt style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12.5, marginBottom: spacing[4] }}>
        Hand-picked from verified employers hiring across Africa this week.
      </Txt>
      <View style={{ alignSelf: 'flex-start', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.field }}>
        <Txt style={{ fontFamily: fonts.displayBold, fontSize: 12.5, color: palette.brand700 }}>See my matches →</Txt>
      </View>
    </View>
  );
}

export default function Feed() {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const strength = SEED_USER.profileStrength;
  const apps = useAppStore((s) => Object.keys(s.applied).length);

  const jobs = useMemo(
    () => (filter === 'All' ? SEED_JOBS : SEED_JOBS.filter((j) => j.category === filter)),
    [filter],
  );

  return (
    <Screen scroll contentStyle={{ gap: spacing[4], paddingTop: spacing[2] }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Txt variant="meta" color={colors.fg3}>
            Welcome back
          </Txt>
          <Txt variant="h2">
            Hi, <Txt variant="h2" color={colors.accent}>{SEED_USER.firstName}</Txt>
          </Txt>
        </View>
        <Avatar initial="A" size={38} online />
      </View>

      {/* quick stats */}
      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <StatCard value={String(apps)} label="Applications" />
        <StatCard value={String(SEED_USER.stats.interviews)} label="Interviews" />
        <StatCard value={`${strength}%`} label="Profile strength" accent />
      </View>

      {/* search */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Card style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3], height: 48, paddingHorizontal: spacing[4] }}>
          <Search size={18} color={colors.fg4} />
          <Txt color={colors.fg4} style={{ fontSize: 13 }}>
            Search remote jobs…
          </Txt>
        </Card>
        <Pressable
          style={({ pressed }) => [
            { width: 48, height: 48, borderRadius: radii.field, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
            shadows.primary,
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
        >
          <SlidersHorizontal size={18} color="#fff" />
        </Pressable>
      </View>

      <Promo />

      {/* section row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[1] }}>
        <Txt variant="h2">Top matches</Txt>
        <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 13, color: colors.brand }}>See all</Txt>
      </View>

      {/* filter chips */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {/* job list */}
      <View style={{ gap: spacing[3] }}>
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
        {jobs.length === 0 ? (
          <Txt center color={colors.fg4} style={{ paddingVertical: spacing[8] }}>
            No roles in this category yet.
          </Txt>
        ) : null}
      </View>
    </Screen>
  );
}
