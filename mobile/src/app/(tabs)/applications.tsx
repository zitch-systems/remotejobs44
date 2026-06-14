// src/app/(tabs)/applications.tsx — application tracker (handoff §4).
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ClipboardList } from 'lucide-react-native';
import { LogoTile, Pill, Screen, Txt } from '@/components/ui';
import { SEED_JOBS } from '@/lib/seed';
import { STATUS_LABEL, type AppStatus } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { radii, spacing, useTheme } from '@/theme';

export default function Applications() {
  const { colors } = useTheme();
  const router = useRouter();
  const applied = useAppStore((s) => s.applied);

  const rows = SEED_JOBS.filter((j) => j.id in applied);

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
          {rows.length} {rows.length === 1 ? 'application' : 'applications'} tracked
        </Txt>
      </View>

      {rows.length === 0 ? (
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
          {rows.map((job) => {
            const c = statusColors(applied[job.id]);
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
                <LogoTile initial={job.logo} grad={job.grad} size={36} />
                <View style={{ flex: 1 }}>
                  <Txt variant="cardTitle" color={colors.fg1} numberOfLines={1}>
                    {job.role}
                  </Txt>
                  <Txt variant="meta" color={colors.fg3} numberOfLines={1}>
                    {job.company} · {job.location}
                  </Txt>
                </View>
                <Pill label={STATUS_LABEL[applied[job.id]]} bg={c.bg} fg={c.fg} border={c.border} small />
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
