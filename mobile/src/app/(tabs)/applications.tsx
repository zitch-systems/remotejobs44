// src/app/(tabs)/applications.tsx — application tracker (handoff §4).
// Status is now editable: tap a row's status pill to move it through the
// pipeline (applied → screening → interview → offer / rejected / withdrawn).
// The store's `applied` map is the source of truth (optimistic + write-through);
// job objects are resolved from the user's fetched applications (or the seed).
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, ClipboardList } from 'lucide-react-native';
import { Button, Card, Chip, Pill, Screen, Txt } from '@/components/ui';
import { CompanyLogo } from '@/components/CompanyLogo';
import { BrandLoader } from '@/components/BrandLoader';
import { SEED_JOBS } from '@/lib/seed';
import { STATUS_FLOW, STATUS_LABEL, type AppStatus } from '@/lib/types';
import { applicationStats, inStatusFilter, STATUS_FILTERS, type StatusFilter } from '@/lib/stats';
import { isSupabaseConfigured } from '@/lib/supabase';
import { fetchApplicationItems } from '@/lib/user-state';
import { useAppStore } from '@/store/app';
import { fonts, radii, spacing, useTheme } from '@/theme';
import type { Job } from '@/lib/types';

/** The job objects behind the user's applications, keyed by id (+ loading). */
function useApplicationJobs(appliedKey: string): { jobsById: Record<string, Job>; loading: boolean; refreshing: boolean; refresh: () => void } {
  const userId = useAppStore((s) => s.userId);
  const [jobsById, setJobsById] = useState<Record<string, Job>>({});
  const [loading, setLoading] = useState(Boolean(isSupabaseConfigured && userId));
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      const map: Record<string, Job> = {};
      for (const j of SEED_JOBS) map[j.id] = j;
      setJobsById(map);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    let active = true;
    if (nonce === 0) setLoading(true);
    fetchApplicationItems(userId)
      .then((items) => {
        if (!active) return;
        const map: Record<string, Job> = {};
        for (const it of items) map[it.job.id] = it.job;
        setJobsById(map);
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      active = false;
    };
    // appliedKey re-fetches when the *set* of applications changes (new apply),
    // not on every status edit.
  }, [userId, appliedKey, nonce]);

  return {
    jobsById,
    loading,
    refreshing,
    refresh: () => {
      setRefreshing(true);
      setNonce((n) => n + 1);
    },
  };
}

function StatusSheet({ editing, onClose, onPick }: { editing: { jobId: string; current: AppStatus } | null; onClose: () => void; onPick: (s: AppStatus) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!editing} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.bgCard,
          borderTopLeftRadius: radii.xl,
          borderTopRightRadius: radii.xl,
          paddingHorizontal: spacing[5],
          paddingTop: spacing[3],
          paddingBottom: Math.max(spacing[5], insets.bottom + spacing[3]),
          gap: spacing[2],
        }}
      >
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border2, marginBottom: spacing[3] }} />
        <Txt variant="eyebrow" color={colors.fg4}>
          Update status
        </Txt>
        {STATUS_FLOW.map((s) => {
          const selected = editing?.current === s;
          return (
            <Pressable
              key={s}
              onPress={() => onPick(s)}
              accessibilityRole="button"
              accessibilityLabel={STATUS_LABEL[s]}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 13,
                  paddingHorizontal: spacing[4],
                  borderRadius: radii.field,
                  backgroundColor: selected ? colors.infoBg : 'transparent',
                },
                pressed && { backgroundColor: colors.bgSection },
              ]}
            >
              <Txt style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: selected ? colors.infoText : colors.fg1 }}>{STATUS_LABEL[s]}</Txt>
              {selected ? <Check size={18} color={colors.infoText} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, padding: spacing[3], gap: 2, ...(accent ? { backgroundColor: colors.successBg, borderColor: colors.successBorder } : null) }}>
      <Txt variant="stat" color={accent ? colors.successText : colors.fg1}>
        {value}
      </Txt>
      <Txt variant="meta" color={colors.fg3} numberOfLines={1}>
        {label}
      </Txt>
    </Card>
  );
}

export default function Applications() {
  const { colors } = useTheme();
  const router = useRouter();
  const applied = useAppStore((s) => s.applied);
  const updateStatus = useAppStore((s) => s.updateStatus);
  const appliedKey = Object.keys(applied).sort().join(',');
  const { jobsById, loading, refreshing, refresh } = useApplicationJobs(appliedKey);
  const [editing, setEditing] = useState<{ jobId: string; current: AppStatus } | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const stats = applicationStats(applied);
  const items = useMemo(() => {
    return Object.keys(applied)
      .map((id) => ({ job: jobsById[id], status: applied[id] }))
      .filter((it): it is { job: Job; status: AppStatus } => Boolean(it.job))
      .sort((a, b) => STATUS_FLOW.indexOf(a.status) - STATUS_FLOW.indexOf(b.status));
  }, [applied, jobsById]);
  const visible = useMemo(() => items.filter((it) => inStatusFilter(it.status, filter)), [items, filter]);

  const statusStyle = (s: AppStatus): { bg: string; fg: string; border?: string } => {
    switch (s) {
      case 'applied':
        return { bg: colors.infoBg, fg: colors.infoText, border: colors.infoBorder };
      case 'screening':
        return { bg: colors.warnBg, fg: colors.warnText, border: colors.warnBorder };
      case 'interview':
      case 'offer':
        return { bg: colors.successBg, fg: colors.successText, border: colors.successBorder };
      case 'rejected':
        return { bg: 'rgba(220,38,38,0.12)', fg: colors.danger };
      case 'withdrawn':
      default:
        return { bg: colors.bgSection, fg: colors.fg3, border: colors.border2 };
    }
  };

  return (
    <Screen scroll refreshing={refreshing} onRefresh={refresh} contentStyle={{ gap: spacing[4], paddingTop: spacing[2] }}>
      <View>
        <Txt variant="screenTitle">Applications</Txt>
        <Txt variant="meta" color={colors.fg3} style={{ marginTop: 2 }}>
          {items.length} {items.length === 1 ? 'application' : 'applications'} tracked
        </Txt>
      </View>

      {loading ? (
        <View style={{ paddingVertical: spacing[16], alignItems: 'center' }}>
          <BrandLoader label="Loading applications…" />
        </View>
      ) : items.length === 0 ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing[16], gap: spacing[3] }}>
          <View style={{ width: 60, height: 60, borderRadius: radii.lg, backgroundColor: colors.bgSection, alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={26} color={colors.fg4} />
          </View>
          <Txt variant="h3" color={colors.fg1}>
            No applications yet
          </Txt>
          <Txt center color={colors.fg3} style={{ maxWidth: 260 }}>
            Apply to a role from the feed and track its progress here.
          </Txt>
          <Button label="Browse jobs" full={false} onPress={() => router.push('/(tabs)/jobs')} style={{ marginTop: spacing[2] }} />
        </View>
      ) : (
        <>
          {/* insights */}
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Stat label="Interviews" value={String(stats.interviewing)} />
            <Stat label="Offers" value={String(stats.offers)} />
            <Stat label="Response" value={`${stats.responseRate}%`} accent />
          </View>

          {/* status filter */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {STATUS_FILTERS.map((f) => (
              <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
            ))}
          </View>

          {visible.length === 0 ? (
            <Txt center color={colors.fg4} style={{ paddingVertical: spacing[10] }}>
              No applications in this view.
            </Txt>
          ) : (
            <View style={{ gap: spacing[3] }}>
              {visible.map(({ job, status }) => {
                const c = statusStyle(status);
                return (
                  <Pressable
                    key={job.id}
                    onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${job.role} at ${job.company}, ${STATUS_LABEL[status]}`}
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing[3],
                        padding: spacing[3],
                        borderRadius: radii.row,
                        backgroundColor: colors.bgCard,
                        borderWidth: 1.5,
                        borderColor: colors.border1,
                      },
                      pressed && { transform: [{ scale: 0.99 }] },
                    ]}
                  >
                    <CompanyLogo job={job} size={36} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="cardTitle" color={colors.fg1} numberOfLines={1}>
                        {job.role}
                      </Txt>
                      <Txt variant="meta" color={colors.fg3} numberOfLines={1}>
                        {job.company} · {job.location}
                      </Txt>
                    </View>
                    <Pressable
                      hitSlop={8}
                      onPress={() => setEditing({ jobId: job.id, current: status })}
                      accessibilityRole="button"
                      accessibilityLabel={`Status: ${STATUS_LABEL[status]}. Tap to change`}
                    >
                      <Pill label={STATUS_LABEL[status]} bg={c.bg} fg={c.fg} border={c.border} small />
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}

      <StatusSheet
        editing={editing}
        onClose={() => setEditing(null)}
        onPick={(s) => {
          if (editing) updateStatus(editing.jobId, s);
          setEditing(null);
        }}
      />
    </Screen>
  );
}
