// src/app/(tabs)/profile.tsx — profile, CV, saved, preferences, sign out (§5).
import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ChevronRight, FileText, LogOut, Pencil, SlidersHorizontal, Bookmark } from 'lucide-react-native';
import { Avatar, Card, Divider, Screen, Txt } from '@/components/ui';
import { SEED_USER } from '@/lib/seed';
import { useAppStore } from '@/store/app';
import { useAuth } from '@/lib/auth';
import { fonts, radii, spacing, useTheme } from '@/theme';

function StrengthBar({ pct }: { pct: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.bgSection, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%' }}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="strength" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#34d399" />
              <Stop offset="1" stopColor="#1ea05e" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" rx={999} fill="url(#strength)" />
        </Svg>
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  danger,
  onPress,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 14, paddingHorizontal: spacing[4] },
          pressed && { backgroundColor: colors.bgSection },
        ]}
      >
        {icon}
        <Txt style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: danger ? colors.danger : colors.fg1 }}>
          {label}
        </Txt>
        {value ? (
          <Txt variant="meta" color={colors.fg3}>
            {value}
          </Txt>
        ) : null}
        {!danger ? <ChevronRight size={18} color={colors.fg5} /> : null}
      </Pressable>
      {!last ? <Divider style={{ marginLeft: 52 }} /> : null}
    </>
  );
}

export default function Profile() {
  const { colors } = useTheme();
  const { signOut } = useAuth();
  const savedCount = useAppStore((s) => s.saved.length);

  return (
    <Screen scroll contentStyle={{ gap: spacing[4], paddingTop: spacing[4] }}>
      {/* identity */}
      <View style={{ alignItems: 'center', gap: spacing[3] }}>
        <Avatar initial="A" size={56} />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Txt variant="h2">{SEED_USER.name}</Txt>
          <Txt variant="meta" color={colors.fg3}>
            {SEED_USER.title}
          </Txt>
        </View>
      </View>

      {/* strength */}
      <Card style={{ padding: spacing[4], gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt variant="h3" color={colors.fg1}>
            Profile strength
          </Txt>
          <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 15, color: colors.success }}>
            {SEED_USER.profileStrength}%
          </Txt>
        </View>
        <StrengthBar pct={SEED_USER.profileStrength} />
      </Card>

      {/* primary list */}
      <Card style={{ paddingVertical: 2 }}>
        <Row icon={<Pencil size={18} color={colors.fg3} />} label="Edit profile" />
        <Row icon={<FileText size={18} color={colors.fg3} />} label="My CV" value={SEED_USER.cvName} />
        <Row icon={<Bookmark size={18} color={colors.fg3} />} label="Saved jobs" value={String(savedCount)} />
        <Row icon={<SlidersHorizontal size={18} color={colors.fg3} />} label="Job preferences" last />
      </Card>

      {/* sign out */}
      <Card style={{ paddingVertical: 2 }}>
        <Row icon={<LogOut size={18} color={colors.danger} />} label="Sign out" danger last onPress={signOut} />
      </Card>
    </Screen>
  );
}
