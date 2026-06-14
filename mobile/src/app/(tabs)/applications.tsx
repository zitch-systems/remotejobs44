// src/app/(tabs)/applications.tsx — application tracker (handoff §4).
// Demo mode resolves seed jobs by the local applied map; live mode reads the
// applications table joined to jobs.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ClipboardList } from 'lucide-react-native';
import { Pill, Screen, Txt } from '@/components/ui';
import { CompanyLogo } from '@/components/CompanyLogo';
import { SEED_JOBS } from '@/lib/seed';
import { STATUS_LABEL, type AppStatus } from '@/lib/types';
import { isSupabaseConfigured } from '@/lib/supabase';
import { fetchApplicationItems, type ApplicationItem } from '@/lib/user-state';
import { useAppStore } from '@/store/app';
import { radii, spacing, useTheme } from '@/theme';

function useApplications(): { items: ApplicationItem[]; loading: boolean } {
  const applied = useAppStore((s) => s.applied);
  const userId = useAppStore((s) => s.userId);
  const [state, setState] = useState<{ items: ApplicationItem[]; loading: boolean }>({
    items: [],
    loading: Boolean(isSupabaseConfigured && userId),
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      const items = SEED_JOBS.filter((j) => j.id in applied).map((job) => ({ job, status: applied[job.id] }));
      setState({ items, loading: false });
      return;
    }
    let active = true;
    fetchApplicationItems(userId)
      .then((items) => active && setState({ items, loading: false }))
      .catch(() => active && setState({ items: [], loading: false }));
    return () => {
      active = false;
    };
  }, [userId, applied]);

  return state;
}

export default function Applications() {
  const { colors } = useTheme();
  const router = useRouter();
  const { items, loading } = useApplications();

  const statusColors = (s: AppStatus) =>
    s === 'applied'
      ? { bg: colors.infoBg, fg: colors.infoText, border: colors.infoBorder }
      : s === 'review'
        ? { bg: colors.warnBg, fg: colors.warnText, border: colors.warnBorder }
        : { bg: colors.successBg, fg: colors.successText, border: colors.successBorder };

  return (
    <Screen scroll contentStyle={{ gap: spacing[4], paddingTop: spacing[2] }}>
      <View>
        <Txt variant="screenTitle">Applications</Txt>
        <Txt variant="meta" color={colors.fg3} style={{ marginTop: 2 }}>
          {items.length} {items.length === 1 ? 'application' : 'applications'} tracked
        </Txt>
      </View>

      {loading ? (
        <View style={{ paddingVertical: spacing[16], alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : items.length === 0 ? (
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
            <ClipboardList size={26} color={colors.fg4} />
          </View>
          <Txt variant="h3" color={colors.fg1}>
            No applications yet
          </Txt>
          <Txt center color={colors.fg3} style={{ maxWidth: 260 }}>
            Apply to a role from the feed and track its progress here.
          </Txt>
        </View>
      ) : (
        <View style={{ gap: spacing[3] }}>
          {items.map(({ job, status }) => {
            const c = statusColors(status);
            return (
              <Pressable
                key={job.id}
                onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
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
                <Pill label={STATUS_LABEL[status]} bg={c.bg} fg={c.fg} border={c.border} small />
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
