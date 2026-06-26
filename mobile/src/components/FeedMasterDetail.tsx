// src/components/FeedMasterDetail.tsx — wide-screen (tablet / unfolded
// foldable) master–detail for the feed (handoff §6). A 352px list pane drives
// a live detail pane; selecting a row updates the detail in place.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BadgeCheck, Bookmark, Check, Search, Zap } from 'lucide-react-native';
import type { Job } from '@/lib/types';
import { useJobs, type JobQuery } from '@/lib/jobs';
import { useAppStore } from '@/store/app';
import { fonts, radii, shadows, spacing, useTheme } from '@/theme';
import { Pill, Txt } from './ui';
import { CompanyLogo } from './CompanyLogo';
import { JobDetailBody } from './JobDetailBody';

export function FeedMasterDetail() {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  // Debounce search, then run search server-side across all jobs
  // (parity with the phone feed) instead of filtering only the loaded page.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const jobQuery: JobQuery = useMemo(() => {
    return { text: debouncedQuery || undefined };
  }, [debouncedQuery]);
  const { jobs } = useJobs(20, jobQuery);

  const selected = jobs.find((j) => j.id === selectedId) ?? jobs[0];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp, flexDirection: 'row' }}>
      {/* ---- list pane ---- */}
      <View style={{ width: 352, borderRightWidth: 1, borderRightColor: colors.border1, backgroundColor: colors.bgCard }}>
        <View style={{ padding: spacing[5], gap: spacing[3] }}>
          <View>
            <Txt variant="screenTitle">Top matches</Txt>
            <Txt variant="meta" color={colors.fg3} style={{ marginTop: 2 }}>
              {jobs.length} verified remote roles for you
            </Txt>
          </View>

          {/* search */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[3],
              height: 44,
              paddingHorizontal: spacing[4],
              borderRadius: radii.field,
              borderWidth: 1.5,
              borderColor: colors.border2,
              backgroundColor: colors.bgApp,
            }}
          >
            <Search size={16} color={colors.fg4} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search roles…"
              placeholderTextColor={colors.fg4}
              style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.fg1, paddingVertical: 0 }}
            />
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: spacing[8], gap: spacing[2] }}>
          {jobs.map((job) => (
            <TabletJobRow key={job.id} job={job} selected={job.id === selected?.id} onPress={() => setSelectedId(job.id)} />
          ))}
          {jobs.length === 0 ? (
            <Txt center color={colors.fg4} style={{ paddingVertical: spacing[8] }}>
              No roles match.
            </Txt>
          ) : null}
        </ScrollView>
      </View>

      {/* ---- detail pane ---- */}
      <View style={{ flex: 1 }}>
        {selected ? (
          <DetailPane job={selected} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Txt color={colors.fg4}>Select a role to see details.</Txt>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function TabletJobRow({ job, selected, onPress }: { job: Job; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          padding: spacing[3],
          borderRadius: radii.field,
          borderWidth: 1.5,
          borderColor: selected ? colors.brand : colors.border1,
          backgroundColor: selected ? colors.infoBg : colors.bgCard,
        },
        selected ? shadows.field : undefined,
        pressed && !selected && { backgroundColor: colors.bgApp },
      ]}
    >
      <CompanyLogo job={job} size={36} />
      <View style={{ flex: 1 }}>
        <Txt variant="cardTitle" color={colors.fg1} numberOfLines={1}>
          {job.role}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Txt variant="meta" color={colors.fg3} numberOfLines={1} style={{ flexShrink: 1 }}>
            {job.company}
          </Txt>
          {job.verified ? <BadgeCheck size={12} color={colors.success} /> : null}
        </View>
      </View>
      <Pill label={`${job.match}%`} bg={colors.successBg} fg={colors.successText} border={colors.successBorder} small />
    </Pressable>
  );
}

function DetailPane({ job }: { job: Job }) {
  const { colors } = useTheme();
  const saved = useAppStore((s) => s.saved.includes(job.id));
  const applied = useAppStore((s) => job.id in s.applied);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const applyTo = useAppStore((s) => s.applyTo);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[4], maxWidth: 760, width: '100%', alignSelf: 'center' }}
    >
      {/* cover */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
        <CompanyLogo job={job} size={56} radius={radii.lg} />
        <View style={{ flex: 1 }}>
          <Txt variant="h2" numberOfLines={2}>
            {job.role}
          </Txt>
          <Txt variant="meta" color={colors.fg3}>
            {job.company}
            {job.verified ? ' · Verified' : ''} · {job.location.replace(/^Remote · /, '')} · {job.time}
          </Txt>
        </View>
      </View>

      <JobDetailBody
        job={job}
        showCompanyRow={false}
        actions={
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Pressable
              onPress={() => toggleSaved(job.id)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing[2],
                  height: 46,
                  paddingHorizontal: spacing[5],
                  borderRadius: radii.row,
                  borderWidth: 1.5,
                  borderColor: colors.border2,
                  backgroundColor: colors.bgCard,
                },
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              <Bookmark size={18} color={saved ? colors.accent : colors.fg3} fill={saved ? colors.accent : 'transparent'} />
              <Txt style={{ fontFamily: fonts.displayBold, fontSize: 13, color: colors.fg2 }}>{saved ? 'Saved' : 'Save'}</Txt>
            </Pressable>
            <Pressable
              onPress={() => applyTo(job)}
              disabled={applied}
              style={({ pressed }) => [
                {
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing[2],
                  height: 46,
                  borderRadius: radii.row,
                  backgroundColor: applied ? colors.success : colors.accent,
                },
                applied ? undefined : shadows.accent,
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              {applied ? <Check size={17} color="#fff" /> : <Zap size={17} color="#fff" fill="#fff" />}
              <Txt style={{ fontFamily: fonts.displayBold, fontSize: 13, color: '#fff' }}>
                {applied ? 'Applied' : 'Apply now'}
              </Txt>
            </Pressable>
          </View>
        }
      />
    </ScrollView>
  );
}
