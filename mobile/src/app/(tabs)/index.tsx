// src/app/(tabs)/index.tsx — Home / Match feed (handoff §2).
// FlatList with pull-to-refresh + pagination, real search + filter sheet, real
// greeting/stats, and skill-personalised match ranking. Switches to the tablet
// master–detail layout at ≥ 840px.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Search, SlidersHorizontal } from 'lucide-react-native';
import { Avatar, Card, Chip, Txt } from '@/components/ui';
import { JobCard } from '@/components/JobCard';
import { BrandLoader } from '@/components/BrandLoader';
import { FeedMasterDetail } from '@/components/FeedMasterDetail';
import { FilterSheet, type JobType, type SortBy } from '@/components/FilterSheet';
import { personalizeJobs, useJobs } from '@/lib/jobs';
import { fetchPreferences, useProfile } from '@/lib/profile';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store/app';
import { fonts, palette, radii, shadows, spacing, useTheme } from '@/theme';
import type { Job } from '@/lib/types';

const FILTERS = ['All', 'Engineering', 'Design', 'Marketing'] as const;

function StatCard({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, padding: spacing[3], gap: 2, ...(accent ? { backgroundColor: colors.warnBg, borderColor: colors.warnBorder } : null) }}>
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
      <Txt style={{ fontFamily: fonts.displayBold, fontSize: 10.5, letterSpacing: 1, color: 'rgba(255,255,255,0.7)' }}>YOUR WEEKLY MATCH</Txt>
      <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 18, color: '#fff', marginTop: 6, marginBottom: 4 }}>New roles that fit your profile</Txt>
      <Txt style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12.5 }}>Hand-picked from verified employers hiring across Africa this week.</Txt>
    </View>
  );
}

export default function Feed() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const feed = useJobs();
  const { profile } = useProfile();
  const applied = useAppStore((s) => s.applied);
  const userId = useAppStore((s) => s.userId);

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<JobType>('Any');
  const [sort, setSort] = useState<SortBy>('match');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [userSkills, setUserSkills] = useState<string[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    fetchPreferences(userId)
      .then((p) => active && setUserSkills(p.skills))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  const jobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list: Job[] = personalizeJobs(feed.jobs, userSkills).filter(
      (j) =>
        (filter === 'All' || j.category === filter) &&
        (type === 'Any' || j.type.toLowerCase() === type.toLowerCase()) &&
        (q === '' || j.role.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)),
    );
    if (sort === 'match') list = [...list].sort((a, b) => b.match - a.match);
    return list;
  }, [feed.jobs, userSkills, filter, type, query, sort]);

  // Tablet / unfolded foldable → master–detail (hooks above run unconditionally).
  if (width >= 840) return <FeedMasterDetail />;

  const firstName = (profile.name || '').trim().split(/\s+/)[0] || 'there';
  const appsCount = Object.keys(applied).length;
  const interviews = Object.values(applied).filter((s) => s === 'interview').length;

  const header = (
    <View style={{ gap: spacing[4], paddingTop: spacing[2] }}>
      {/* greeting */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Txt variant="meta" color={colors.fg3}>
            Welcome back
          </Txt>
          <Txt variant="h2">
            Hi, <Txt variant="h2" color={colors.accent}>{firstName}</Txt>
          </Txt>
        </View>
        <Avatar initial={(profile.name || profile.email || 'U').charAt(0).toUpperCase()} size={38} online />
      </View>

      {/* stats */}
      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <StatCard value={String(appsCount)} label="Applications" />
        <StatCard value={String(interviews)} label="Interviews" />
        <StatCard value={`${profile.completion}%`} label="Profile strength" accent />
      </View>

      {/* search + filter */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Card style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3], height: 48, paddingHorizontal: spacing[4] }}>
          <Search size={18} color={colors.fg4} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search remote jobs…"
            placeholderTextColor={colors.fg4}
            style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.fg1, paddingVertical: 0 }}
          />
        </Card>
        <Pressable
          onPress={() => setSheetOpen(true)}
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

      {/* section + chips */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt variant="h2">Top matches</Txt>
        {(type !== 'Any' || sort !== 'match') && (
          <Pressable onPress={() => { setType('Any'); setSort('match'); }}>
            <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 13, color: colors.brand }}>Reset</Txt>
          </Pressable>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <FlatList
        data={feed.loading ? [] : jobs}
        keyExtractor={(j) => j.id}
        renderItem={({ item }) => <JobCard job={item} />}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: spacing[3] }} />}
        contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[1], paddingBottom: spacing[10], gap: spacing[4] }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} tintColor={colors.brand} />}
        onEndReachedThreshold={0.4}
        onEndReached={feed.loadMore}
        ListEmptyComponent={
          feed.loading ? (
            <View style={{ paddingVertical: spacing[12], alignItems: 'center' }}>
              <BrandLoader label="Finding remote jobs…" />
            </View>
          ) : feed.error ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing[10], gap: spacing[3] }}>
              <Txt center color={colors.fg3}>
                Couldn&apos;t load jobs.
              </Txt>
              <Pressable onPress={feed.refresh}>
                <Txt style={{ fontFamily: fonts.displayBold, color: colors.brand }}>Retry</Txt>
              </Pressable>
            </View>
          ) : (
            <Txt center color={colors.fg4} style={{ paddingVertical: spacing[8] }}>
              No roles match your filters.
            </Txt>
          )
        }
        ListFooterComponent={
          feed.hasMore && jobs.length > 0 && !feed.loading ? (
            <View style={{ paddingVertical: spacing[5] }}>
              <ActivityIndicator color={colors.fg4} />
            </View>
          ) : null
        }
      />
      <FilterSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} type={type} setType={setType} sort={sort} setSort={setSort} />
    </SafeAreaView>
  );
}
