// src/app/(tabs)/saved.tsx — the user's saved jobs. Live mode fetches from
// saved_jobs IDs hydrated through the trusted jobs API; demo derives from the seed set. Either way the
// displayed list is filtered by the live store so unsaving removes a card
// instantly.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import { JobCard } from '@/components/JobCard';
import { BrandLoader } from '@/components/BrandLoader';
import { Button, Screen, Txt } from '@/components/ui';
import { SEED_JOBS } from '@/lib/seed';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { scheduleAfterAuth } from '@/lib/jobs';
import { fetchSavedJobs } from '@/lib/user-state';
import { useAppStore } from '@/store/app';
import { radii, spacing, useTheme } from '@/theme';
import type { Job } from '@/lib/types';

function useSavedJobs(): { jobs: Job[]; loading: boolean; refreshing: boolean; refresh: () => void } {
  const userId = useAppStore((s) => s.userId);
  const savedIds = useAppStore((s) => s.saved);
  const [fetched, setFetched] = useState<Job[]>([]);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(isSupabaseConfigured && userId));
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      ++reqRef.current;
      setFetched([]);
      setFetchedFor(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const reqId = ++reqRef.current;
    setFetched([]);
    setFetchedFor(null);
    setLoading(true);
    fetchSavedJobs(userId)
      .then((jobs) => {
        if (reqId !== reqRef.current) return;
        setFetched(jobs);
        setFetchedFor(userId);
      })
      .catch(() => {})
      .finally(() => {
        if (reqId === reqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      ++reqRef.current;
    };
  }, [userId, nonce]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data } = supabase.auth.onAuthStateChange(() => {
      ++reqRef.current;
      setFetched([]);
      setFetchedFor(null);
      setLoading(true);
      setRefreshing(false);
      if (timer) clearTimeout(timer);
      timer = scheduleAfterAuth(() => setNonce((n) => n + 1));
    });
    return () => {
      if (timer) clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  const jobs = useMemo(() => {
    const source = !isSupabaseConfigured ? SEED_JOBS : fetchedFor === userId ? fetched : [];
    return source.filter((j) => savedIds.includes(j.id));
  }, [fetched, fetchedFor, savedIds, userId]);

  return {
    jobs,
    loading,
    refreshing,
    refresh: () => {
      setRefreshing(true);
      setNonce((n) => n + 1);
    },
  };
}

export default function Saved() {
  const { colors } = useTheme();
  const router = useRouter();
  const { jobs, loading, refreshing, refresh } = useSavedJobs();

  return (
    <Screen scroll refreshing={refreshing} onRefresh={refresh} contentStyle={{ gap: spacing[4], paddingTop: spacing[2] }}>
      <View>
        <Txt variant="screenTitle">Saved</Txt>
        <Txt variant="meta" color={colors.fg3} style={{ marginTop: 2 }}>
          {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} saved
        </Txt>
      </View>

      {loading ? (
        <View style={{ paddingVertical: spacing[16], alignItems: 'center' }}>
          <BrandLoader label="Loading saved jobs…" />
        </View>
      ) : jobs.length === 0 ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing[16], gap: spacing[3] }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: radii.lg,
              backgroundColor: colors.bgSection,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bookmark size={26} color={colors.fg4} />
          </View>
          <Txt variant="h3" color={colors.fg1}>
            No saved jobs yet
          </Txt>
          <Txt center color={colors.fg3} style={{ maxWidth: 260 }}>
            Tap the bookmark on any role to save it for later.
          </Txt>
          <Button label="Browse jobs" full={false} onPress={() => router.push('/(tabs)/jobs')} style={{ marginTop: spacing[2] }} />
        </View>
      ) : (
        <View style={{ gap: spacing[3] }}>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </View>
      )}
    </Screen>
  );
}
