// src/app/(tabs)/jobs.tsx — browse every remote role. Same live feed as Home,
// but a plain searchable / filterable list (no dashboard chrome), defaulting to
// the most recent roles. Reuses useJobs + JobCard + FilterSheet.
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookmarkPlus, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { Card, Chip, Txt } from '@/components/ui';
import { JobCard } from '@/components/JobCard';
import { BrandLoader } from '@/components/BrandLoader';
import { SearchSuggestions } from '@/components/SearchSuggestions';
import { FilterSheet, type JobType, type SortBy } from '@/components/FilterSheet';
import { useJobs } from '@/lib/jobs';
import { activeFilterCount, jobMatchesFilters, type ExperienceLevel } from '@/lib/filters';
import { isEmptySearch, sameCriteria, searchLabel, type SearchCriteria } from '@/lib/saved-search';
import { useSearchHistory } from '@/store/search';
import { useSavedSearches } from '@/store/saved-searches';
import { fonts, radii, shadows, spacing, useTheme } from '@/theme';
import type { Job } from '@/lib/types';

const FILTERS = ['All', 'Engineering', 'Design', 'Marketing'] as const;

export default function Jobs() {
  const { colors } = useTheme();
  const feed = useJobs();

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<JobType>('Any');
  const [level, setLevel] = useState<ExperienceLevel>('Any');
  const [sort, setSort] = useState<SortBy>('recent');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const addSearch = useSearchHistory((s) => s.add);
  const savedSearches = useSavedSearches((s) => s.items);
  const addSavedSearch = useSavedSearches((s) => s.add);
  const removeSavedSearch = useSavedSearches((s) => s.remove);

  const jobs = useMemo(() => {
    let list: Job[] = feed.jobs.filter((j) => jobMatchesFilters(j, { category: filter, type, level, query }));
    if (sort === 'match') list = [...list].sort((a, b) => b.match - a.match);
    return list;
  }, [feed.jobs, filter, type, level, query, sort]);

  const fCount = activeFilterCount(type, level);
  const resetSheet = () => {
    setType('Any');
    setLevel('Any');
    setSort('recent');
  };
  const resetAll = () => {
    setFilter('All');
    setQuery('');
    resetSheet();
  };

  const criteria: SearchCriteria = { query, category: filter, type, level, sort };
  const canSave = !isEmptySearch(criteria) && !savedSearches.some((s) => sameCriteria(s, criteria));
  const applySaved = (s: SearchCriteria) => {
    setQuery(s.query);
    setFilter(s.category as (typeof FILTERS)[number]);
    setType(s.type as JobType);
    setLevel(s.level as ExperienceLevel);
    setSort(s.sort as SortBy);
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

      {/* category chips */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {/* saved searches */}
      {savedSearches.length > 0 || canSave ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing[2], paddingRight: spacing[2] }}
        >
          {canSave ? (
            <Pressable
              onPress={() => addSavedSearch(criteria)}
              accessibilityRole="button"
              accessibilityLabel="Save this search"
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  height: 32,
                  paddingHorizontal: spacing[3],
                  borderRadius: radii.field,
                  backgroundColor: colors.infoBg,
                  borderWidth: 1.5,
                  borderColor: colors.infoBorder,
                },
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
            >
              <BookmarkPlus size={14} color={colors.brand} />
              <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 12.5, color: colors.brand }}>Save search</Txt>
            </Pressable>
          ) : null}
          {savedSearches.map((s) => (
            <View
              key={s.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                height: 32,
                paddingLeft: spacing[3],
                paddingRight: 6,
                borderRadius: radii.field,
                backgroundColor: colors.bgCard,
                borderWidth: 1.5,
                borderColor: colors.border2,
              }}
            >
              <Pressable onPress={() => applySaved(s)} accessibilityRole="button" accessibilityLabel={`Apply saved search: ${searchLabel(s)}`} hitSlop={6}>
                <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 12.5, color: colors.fg2 }} numberOfLines={1}>
                  {searchLabel(s)}
                </Txt>
              </Pressable>
              <Pressable onPress={() => removeSavedSearch(s.id)} accessibilityRole="button" accessibilityLabel={`Remove saved search: ${searchLabel(s)}`} hitSlop={6} style={{ padding: 2 }}>
                <X size={12} color={colors.fg4} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
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
                onPress={resetAll}
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
        onReset={resetSheet}
      />
    </SafeAreaView>
  );
}
