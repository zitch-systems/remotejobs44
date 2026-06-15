// src/app/(tabs)/jobs.tsx — browse every remote role. Same live feed as Home,
// but a plain searchable / filterable list (no dashboard chrome), defaulting to
// the most recent roles. Reuses useJobs + JobCard + FilterSheet.
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, SlidersHorizontal } from 'lucide-react-native';
import { Card, Chip, Txt } from '@/components/ui';
import { JobCard } from '@/components/JobCard';
import { BrandLoader } from '@/components/BrandLoader';
import { SearchSuggestions } from '@/components/SearchSuggestions';
import { FilterSheet, type JobType, type SortBy } from '@/components/FilterSheet';
import { useJobs } from '@/lib/jobs';
import { useSearchHistory } from '@/store/search';
import { fonts, radii, shadows, spacing, useTheme } from '@/theme';
import type { Job } from '@/lib/types';

const FILTERS = ['All', 'Engineering', 'Design', 'Marketing'] as const;

export default function Jobs() {
  const { colors } = useTheme();
  const feed = useJobs();

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<JobType>('Any');
  const [sort, setSort] = useState<SortBy>('recent');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const addSearch = useSearchHistory((s) => s.add);

  const jobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list: Job[] = feed.jobs.filter(
      (j) =>
        (filter === 'All' || j.category === filter) &&
        (type === 'Any' || j.type.toLowerCase() === type.toLowerCase()) &&
        (q === '' || j.role.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)),
    );
    if (sort === 'match') list = [...list].sort((a, b) => b.match - a.match);
    return list;
  }, [feed.jobs, filter, type, query, sort]);

  const resetFilters = () => {
    setFilter('All');
    setType('Any');
    setSort('recent');
    setQuery('');
  };

  const header = (
    <View style={{ gap: spacing[4], paddingTop: spacing[2] }}>
      <View>
        <Txt variant="screenTitle">Jobs</Txt>
        <Txt variant="meta" color={colors.fg3} style={{ marginTop: 2 }}>
          Browse every verified remote role
        </Txt>
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
          accessibilityLabel="Filter and sort"
          style={({ pressed }) => [
            { width: 48, height: 48, borderRadius: radii.field, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
            shadows.primary,
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
        >
          <SlidersHorizontal size={18} color="#fff" />
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

      {/* category chips */}
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
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} tintColor={colors.brand} />}
        onEndReachedThreshold={0.4}
        onEndReached={feed.loadMore}
        ListEmptyComponent={
          feed.loading ? (
            <View style={{ paddingVertical: spacing[12], alignItems: 'center' }}>
              <BrandLoader label="Loading remote jobs…" />
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
                No roles match your search.
              </Txt>
              <Pressable
                onPress={resetFilters}
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
      <FilterSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} type={type} setType={setType} sort={sort} setSort={setSort} />
    </SafeAreaView>
  );
}
