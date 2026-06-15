// src/app/(tabs)/profile.tsx — profile, CV, saved, preferences, sign out (§5).
// Real profile data (name / avatar initial / server-computed strength) with a
// seed fallback in demo; every row now navigates.
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Bookmark, ChevronRight, FileText, LogOut, MessageSquare, Monitor, Moon, Pencil, PenLine, Settings, Sparkles, SlidersHorizontal, Sun, UserPlus } from 'lucide-react-native';
import { Avatar, Button, Card, Divider, Pill, Screen, Txt } from '@/components/ui';
import { ProfileChecklist } from '@/components/ProfileChecklist';
import { useProfile, type Plan } from '@/lib/profile';
import { useAppStore } from '@/store/app';
import { useThemeMode } from '@/store/theme';
import { useAuth } from '@/lib/auth';
import { fonts, radii, spacing, useTheme } from '@/theme';

const PLAN_BADGE: Record<Plan, { label: string; paid: boolean }> = {
  free: { label: 'Free plan', paid: false },
  daily: { label: 'Day Pass', paid: true },
  pro: { label: 'Pro', paid: true },
  admin: { label: 'Admin', paid: true },
};

function StrengthBar({ pct }: { pct: number }) {
  const { colors } = useTheme();
  const w = Math.max(0, Math.min(100, pct));
  // A plain clipped View — reliable on Android (a percentage-sized SVG <Rect
  // rx> renders as an ellipse there). The rounded track does the corner shaping.
  return (
    <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.bgSection, overflow: 'hidden' }}>
      <View style={{ width: `${w}%`, height: '100%', borderRadius: 999, backgroundColor: colors.success }} />
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
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}, ${value}` : label}
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
  const badge = PLAN_BADGE[profile.plan] ?? PLAN_BADGE.free;
  const appearanceIcon =
    mode === 'system' ? <Monitor size={18} color={colors.fg3} /> : mode === 'light' ? <Sun size={18} color={colors.fg3} /> : <Moon size={18} color={colors.fg3} />;
  const appearanceLabel = mode.charAt(0).toUpperCase() + mode.slice(1);

  return (
    <Screen scroll contentStyle={{ gap: spacing[4], paddingTop: spacing[4] }}>
      {/* identity */}
      <View style={{ alignItems: 'center', gap: spacing[3] }}>
        <Avatar initial={initial} size={56} uri={profile.avatarUrl} />
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Txt variant="h2">{profile.name || 'Your profile'}</Txt>
          <Txt variant="meta" color={colors.fg3}>
            {profile.email ?? ''}
          </Txt>
          <Pressable
            onPress={() => router.push('/profile/plans')}
            accessibilityRole="button"
            accessibilityLabel={`${badge.label}. View plans`}
            style={({ pressed }) => [{ marginTop: 2 }, pressed && { opacity: 0.7 }]}
          >
            <Pill
              label={badge.paid ? badge.label.toUpperCase() : badge.label}
              icon={badge.paid ? <Sparkles size={11} color={colors.successText} /> : undefined}
              bg={badge.paid ? colors.successBg : colors.bgSection}
              fg={badge.paid ? colors.successText : colors.fg3}
              border={badge.paid ? colors.successBorder : colors.border2}
            />
          </Pressable>
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

      {/* subscription — current plan + resubscribe / manage */}
      <Card style={{ padding: spacing[4], gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              backgroundColor: badge.paid ? colors.successBg : colors.infoBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={18} color={badge.paid ? colors.success : colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="cardTitle" color={colors.fg1}>
              Subscription
            </Txt>
            <Txt variant="meta" color={colors.fg3}>
              {badge.paid ? `You're on ${badge.label}.` : "You're on the Free plan."}
            </Txt>
          </View>
        </View>
        <Button
          label={badge.paid ? 'Manage subscription' : 'Upgrade to Pro'}
          variant={badge.paid ? 'ghost' : 'primary'}
          onPress={() => router.push('/profile/plans')}
        />
      </Card>

      <ProfileChecklist />

      {/* primary list */}
      <Card style={{ paddingVertical: 2 }}>
        <Row icon={<Pencil size={18} color={colors.fg3} />} label="Edit profile" onPress={() => router.push('/profile/edit')} />
        <Row icon={<FileText size={18} color={colors.fg3} />} label="My CV" value={profile.cvUrl ? 'Added' : 'None'} onPress={() => router.push('/profile/cv')} />
        <Row icon={<Sparkles size={18} color={colors.fg3} />} label="AI CV review" onPress={() => router.push('/profile/ai-review')} />
        <Row icon={<MessageSquare size={18} color={colors.fg3} />} label="AI interview prep" onPress={() => router.push('/profile/interview-prep')} />
        <Row icon={<PenLine size={18} color={colors.fg3} />} label="AI cover letter" onPress={() => router.push('/profile/cover-letter')} />
        <Row icon={<Bookmark size={18} color={colors.fg3} />} label="Saved jobs" value={String(savedCount)} onPress={() => router.push('/(tabs)/saved')} />
        <Row icon={<SlidersHorizontal size={18} color={colors.fg3} />} label="Job preferences" onPress={() => router.push('/profile/preferences')} />
        <Row icon={<Bell size={18} color={colors.fg3} />} label="Notifications" onPress={() => router.push('/profile/notifications')} />
        <Row icon={<Settings size={18} color={colors.fg3} />} label="Settings" onPress={() => router.push('/profile/settings')} />
        <Row icon={appearanceIcon} label="Appearance" value={appearanceLabel} onPress={cycleTheme} last />
      </Card>

      {/* invite — growth */}
      <Card style={{ paddingVertical: 2 }}>
        <Row icon={<UserPlus size={18} color={colors.brand} />} label="Invite friends" onPress={() => router.push('/profile/invite')} last />
      </Card>

      {/* sign out */}
      <Card style={{ paddingVertical: 2 }}>
        <Row icon={<LogOut size={18} color={colors.danger} />} label="Sign out" danger last onPress={signOut} />
      </Card>
    </Screen>
  );
}
