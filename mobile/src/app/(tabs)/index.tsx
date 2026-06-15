// src/app/(tabs)/index.tsx — Home / Match feed (handoff §2).
// FlatList with pull-to-refresh + pagination, real search + filter sheet, real
// greeting/stats, and skill-personalised match ranking. Switches to the tablet
// master–detail layout at ≥ 840px.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, RefreshControl, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Search, SlidersHorizontal, Sparkles, X } from 'lucide-react-native';
import { Avatar, Card, Chip, Txt } from '@/components/ui';
import { JobCard } from '@/components/JobCard';
import { BrandLoader } from '@/components/BrandLoader';
import { RecentlyViewed } from '@/components/RecentlyViewed';
import { SearchSuggestions } from '@/components/SearchSuggestions';
import { FeedMasterDetail } from '@/components/FeedMasterDetail';
import { FilterSheet, type JobType, type SortBy } from '@/components/FilterSheet';
import { personalizeJobs, useJobs } from '@/lib/jobs';
import { activeFilterCount, jobMatchesFilters, type ExperienceLevel } from '@/lib/filters';
import { fetchPreferences, useProfile } from '@/lib/profile';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store/app';
import { useSearchHistory } from '@/store/search';
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
  // Solid brand background as a base (so it never flashes / overflows white),
  // with the gradient drawn over it in MEASURED pixels — a percentage-sized SVG
  // doesn't fill reliably on Android, which left a white gap on the right.
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
      }}
      style={[{ borderRadius: radii.promo, overflow: 'hidden', padding: spacing[5], backgroundColor: palette.brand700 }, shadows.primary]}
    >
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="promo" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={palette.brand700} />
              <Stop offset="1" stopColor="#1e3a8a" />
            </LinearGradient>
          </Defs>
          <Rect width={size.w} height={size.h} fill="url(#promo)" />
        </Svg>
      ) : null}
      <Txt style={{ fontFamily: fonts.displayBold, fontSize: 10.5, letterSpacing: 1, color: 'rgba(255,255,255,0.7)' }}>YOUR WEEKLY MATCH</Txt>
      <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 18, color: '#fff', marginTop: 6, marginBottom: 4 }}>New roles that fit your profile</Txt>
      <Txt style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, lineHeight: 18 }}>Hand-picked from verified employers hiring across Africa this week.</Txt>
    </View>
  );
}

export default function Feed() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const feed = useJobs();
  const { profile } = useProfile();
  const applied = useAppStore((s) => s.applied);
  const userId = useAppStore((s) => s.userId);

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<JobType>('Any');
  const [level, setLevel] = useState<ExperienceLevel>('Any');
  const [sort, setSort] = useState<SortBy>('match');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const addSearch = useSearchHistory((s) => s.add);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    fetchPreferences(userId)
      .then((p) => {
        if (active) {
          setUserSkills(p.skills);
          setSkillsLoaded(true);
        }
      })
      .catch(() => active && setSkillsLoaded(true));
    return () => {
      active = false;
    };
  }, [userId]);

  const showSkillsNudge = isSupabaseConfigured && Boolean(userId) && skillsLoaded && userSkills.length === 0 && !nudgeDismissed;

  const jobs = useMemo(() => {
    let list: Job[] = personalizeJobs(feed.jobs, userSkills).filter((j) => jobMatchesFilters(j, { category: filter, type, level, query }));
    if (sort === 'match') list = [...list].sort((a, b) => b.match - a.match);
    return list;
  }, [feed.jobs, userSkills, filter, type, level, query, sort]);

  // Tablet / unfolded foldable → master–detail (hooks above run unconditionally).
  if (width >= 840) return <FeedMasterDetail />;

  const firstName = (profile.name || '').trim().split(/\s+/)[0] || 'there';
  const appsCount = Object.keys(applied).length;
  const interviews = Object.values(applied).filter((s) => s === 'interview').length;
  const fCount = activeFilterCount(type, level);
  const resetFilters = () => {
    setType('Any');
    setLevel('Any');
    setSort('match');
  };

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
            returnKeyType="search"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            onSubmitEditing={() => {
              addSearch(query);
              setSearchFocused(false);
            }}
            style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.fg1, paddingVertical: 0 }}
          />
        </Card>
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={fCount > 0 ? `Filter and sort, ${fCount} active` : 'Filter and sort'}
          style={({ pressed }) => [
            { width: 48, height: 48, borderRadius: radii.field, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
            shadows.primary,
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
        >
          <SlidersHorizontal size={18} color="#fff" />
          {fCount > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: -5,
                right: -5,
                minWidth: 18,
                height: 18,
                paddingHorizontal: 4,
                borderRadius: 999,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: colors.bgApp,
              }}
            >
              <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 10, color: '#fff' }}>{fCount}</Txt>
            </View>
          ) : null}
        </Pressable>
      </View>

      {searchFocused ? (
        <SearchSuggestions
          onSelect={(q) => {
            setQuery(q);
            addSearch(q);
            setSearchFocused(false);
            Keyboard.dismiss();
          }}
        />
      ) : null}

      {showSkillsNudge ? (
        <Pressable
          onPress={() => router.push('/profile/preferences')}
          style={({ pressed }) => [
            { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: radii.card, backgroundColor: colors.infoBg, borderWidth: 1.5, borderColor: colors.infoBorder },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Sparkles size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Txt variant="cardTitle" color={colors.fg1}>
              Sharper matches
            </Txt>
            <Txt variant="meta" color={colors.fg3}>
              Add your skills so we can rank roles for you.
            </Txt>
          </View>
          <Pressable hitSlop={8} onPress={() => setNudgeDismissed(true)}>
            <X size={16} color={colors.fg4} />
          </Pressable>
        </Pressable>
      ) : null}

      <Promo />

      {query.trim() === '' ? <RecentlyViewed /> : null}

      {/* section + chips */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt variant="h2">Top matches</Txt>
        {(type !== 'Any' || level !== 'Any' || sort !== 'match') && (
          <Pressable onPress={resetFilters}>
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
            <View style={{ alignItems: 'center', paddingVertical: spacing[10], gap: spacing[3] }}>
              <Txt center color={colors.fg4}>
                No roles match your filters.
              </Txt>
              <Pressable
                onPress={() => {
                  setFilter('All');
                  setQuery('');
                  resetFilters();
                }}
                style={({ pressed }) => [
                  { paddingHorizontal: spacing[5], paddingVertical: 10, borderRadius: radii.field, borderWidth: 1.5, borderColor: colors.border2 },
                  pressed && { backgroundColor: colors.bgSection },
                ]}
              >
                <Txt style={{ fontFamily: fonts.displayBold, fontSize: 13, color: colors.brand }}>Reset filters</Txt>
              </Pressable>
            </View>
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
      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        type={type}
        setType={setType}
        level={level}
        setLevel={setLevel}
        sort={sort}
        setSort={setSort}
        onReset={resetFilters}
      />
    </SafeAreaView>
  );
}
