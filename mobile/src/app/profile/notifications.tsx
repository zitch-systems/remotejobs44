// src/app/profile/notifications.tsx — notification preferences. Persisted via
// store/prefs; the push registration (lib/push) honours "New job matches".
import React from 'react';
import { Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Card, Divider, IconButton, Txt } from '@/components/ui';
import { usePrefs } from '@/store/prefs';
import { fonts, spacing, useTheme } from '@/theme';

function ToggleRow({
  label,
  desc,
  value,
  onValueChange,
  last,
}: {
  label: string;
  desc: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4], paddingVertical: 14, paddingHorizontal: spacing[4] }}>
        <View style={{ flex: 1 }}>
          <Txt style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.fg1 }}>{label}</Txt>
          <Txt variant="meta" color={colors.fg3} style={{ marginTop: 2 }}>
            {desc}
          </Txt>
        </View>
        <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.brand, false: colors.border2 }} thumbColor="#fff" />
      </View>
      {!last ? <Divider style={{ marginLeft: spacing[4] }} /> : null}
    </>
  );
}

export default function Notifications() {
  const { colors } = useTheme();
  const router = useRouter();
  const alertsMatches = usePrefs((s) => s.alertsMatches);
  const alertsApplications = usePrefs((s) => s.alertsApplications);
  const setAlertsMatches = usePrefs((s) => s.setAlertsMatches);
  const setAlertsApplications = usePrefs((s) => s.setAlertsApplications);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing.screenX, paddingTop: spacing[2] }}>
        <IconButton onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2">Notifications</Txt>
      </View>

      <View style={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[6], gap: spacing[4] }}>
        <Card style={{ paddingVertical: 2 }}>
          <ToggleRow
            label="New job matches"
            desc="Get a push when new roles match your skills."
            value={alertsMatches}
            onValueChange={setAlertsMatches}
          />
          <ToggleRow
            label="Application updates"
            desc="Status changes on roles you've applied to."
            value={alertsApplications}
            onValueChange={setAlertsApplications}
            last
          />
        </Card>
        <Txt variant="meta" color={colors.fg4} style={{ paddingHorizontal: spacing[2] }}>
          Push notifications also need system permission, and require a build
          installed from the store / a dev client (not Expo Go).
        </Txt>
      </View>
    </SafeAreaView>
  );
}
