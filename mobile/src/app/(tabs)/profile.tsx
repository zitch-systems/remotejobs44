// src/app/(tabs)/profile.tsx — profile, CV, saved, preferences, sign out (§5).
// Real profile data (name / avatar initial / server-computed strength) with a
// seed fallback in demo; every row now navigates.
import React from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Bookmark, ChevronRight, FileText, LogOut, Monitor, Moon, Pencil, SlidersHorizontal, Sun } from 'lucide-react-native';
import { Avatar, Card, Divider, Screen, Txt } from '@/components/ui';
import { useProfile } from '@/lib/profile';
import { useAppStore } from '@/store/app';
import { useThemeMode } from '@/store/theme';
import { useAuth } from '@/lib/auth';
import { fonts, radii, spacing, useTheme } from '@/theme';

function StrengthBar({ pct }: { pct: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.bgSection, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%' }}>
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
  const router = useRouter();
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const savedCount = useAppStore((s) => s.saved.length);
  const mode = useThemeMode((s) => s.mode);
  const cycleTheme = useThemeMode((s) => s.cycle);

  const initial = (profile.name || profile.email || 'U').trim().charAt(0).toUpperCase();
  const appearanceIcon =
    mode === 'system' ? <Monitor size={18} color={colors.fg3} /> : mode === 'light' ? <Sun size={18} color={colors.fg3} /> : <Moon size={18} color={colors.fg3} />;
  const appearanceLabel = mode.charAt(0).toUpperCase() + mode.slice(1);

  function openCv() {
    if (profile.cvUrl) Linking.openURL(profile.cvUrl).catch(() => {});
    else Alert.alert('No CV yet', 'Upload your CV from the RemoteJobs44 web app to attach it to applications.');
  }

  return (
    <Screen scroll contentStyle={{ gap: spacing[4], paddingTop: spacing[4] }}>
      {/* identity */}
      <View style={{ alignItems: 'center', gap: spacing[3] }}>
        <Avatar initial={initial} size={56} />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Txt variant="h2">{profile.name || 'Your profile'}</Txt>
          <Txt variant="meta" color={colors.fg3}>
            {profile.email ?? ''}
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
            {profile.completion}%
          </Txt>
        </View>
        <StrengthBar pct={profile.completion} />
      </Card>

      {/* primary list */}
      <Card style={{ paddingVertical: 2 }}>
        <Row icon={<Pencil size={18} color={colors.fg3} />} label="Edit profile" onPress={() => router.push('/profile/edit')} />
        <Row icon={<FileText size={18} color={colors.fg3} />} label="My CV" value={profile.cvUrl ? 'View' : 'None'} onPress={openCv} />
        <Row icon={<Bookmark size={18} color={colors.fg3} />} label="Saved jobs" value={String(savedCount)} onPress={() => router.push('/(tabs)/saved')} />
        <Row icon={<SlidersHorizontal size={18} color={colors.fg3} />} label="Job preferences" onPress={() => router.push('/profile/preferences')} />
        <Row icon={appearanceIcon} label="Appearance" value={appearanceLabel} onPress={cycleTheme} last />
      </Card>

      {/* sign out */}
      <Card style={{ paddingVertical: 2 }}>
        <Row icon={<LogOut size={18} color={colors.danger} />} label="Sign out" danger last onPress={signOut} />
      </Card>
    </Screen>
  );
}
