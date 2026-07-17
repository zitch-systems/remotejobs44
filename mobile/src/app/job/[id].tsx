// src/app/job/[id].tsx — phone job-detail route: header + shared body + fixed
// apply bar + success burst (handoff §3). Content lives in <JobDetailBody/>.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, BadgeCheck, Bookmark, Check, Clock, ExternalLink, MapPin, Share2, Zap } from 'lucide-react-native';
import { Txt } from '@/components/ui';
import { CompanyLogo } from '@/components/CompanyLogo';
import { BrandLoaderScreen } from '@/components/BrandLoader';
import { JobDetailBody } from '@/components/JobDetailBody';
import { SimilarRoles } from '@/components/SimilarRoles';
import { useJob, fetchApplyChannel } from '@/lib/jobs';
import { applyTarget } from '@/lib/apply';
import { useProfile } from '@/lib/profile';
import { canApply, freeTrialBlockedMessage, isPaid } from '@/lib/entitlements';
import { evaluateFreeTrial } from '@/lib/free-trial';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store/app';
import { useRecentJobs } from '@/store/recent-jobs';
import { toast } from '@/store/toast';
import { fonts, radii, shadows, spacing, useTheme } from '@/theme';

// Translucent white icon button for the dark detail hero (§5.4).
function HeroIcon({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          width: 38,
          height: 38,
          borderRadius: 11,
          backgroundColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1.5,
          borderColor: 'rgba(255,255,255,0.18)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      {children}
    </Pressable>
  );
}

// Meta chip on the dark hero (region / type / level).
function HeroMeta({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }}>
      {icon}
      <Txt style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)' }}>{label}</Txt>
    </View>
  );
}

export default function JobDetail() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { job, loading } = useJob(id);
  const saved = useAppStore((s) => (job ? s.saved.includes(job.id) : false));
  const applied = useAppStore((s) => (job ? job.id in s.applied : false));
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const applyTo = useAppStore((s) => s.applyTo);

  const addRecent = useRecentJobs((s) => s.add);
  const { profile, loading: profileLoading } = useProfile();
  // Real, server-hydrated count of the user's applications — the free-trial
  // allowance is measured against this (not a tamperable per-day counter).
  const usedApplications = useAppStore((s) => Object.keys(s.applied).length);
  const appliedHydrated = useAppStore((s) => s.hydrated);
  // Until the profile (registeredAt/plan) and applied rows have loaded, the
  // trial state is unknown — don't let an exhausted user start a doomed apply
  // that the server would reject with a confusing "sent → couldn't send".
  const gateLoading = isSupabaseConfigured && (profileLoading || !appliedHydrated);

  const [burst, setBurst] = useState(false);
  const burstAnim = useRef(new Animated.Value(0)).current;

  // Record the view once the role resolves (for Home's "Recently viewed").
  useEffect(() => {
    if (job) addRecent(job);
  }, [job?.id, addRecent]);

  // Paid-only apply channel: apply_url/apply_email are no longer in the public
  // job row (server-side paywall, migration_v65) — entitled users fetch them
  // via the plan-checked RPC. Free users keep the in-app one-tap apply.
  const [channel, setChannel] = useState<{ applyUrl?: string; applyEmail?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    if (job && isPaid(profile.plan)) {
      fetchApplyChannel(job.id).then((c) => { if (alive) setChannel(c); }).catch(() => {});
    } else {
      setChannel(null);
    }
    return () => { alive = false; };
  }, [job?.id, profile.plan]);

  useEffect(() => {
    if (!burst) return;
    burstAnim.setValue(0);
    Animated.spring(burstAnim, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
    const t = setTimeout(() => setBurst(false), 1100);
    return () => clearTimeout(t);
  }, [burst, burstAnim]);

  if (loading) {
    return <BrandLoaderScreen label="Loading role…" />;
  }

  if (!job) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgApp, alignItems: 'center', justifyContent: 'center' }}>
        <Txt color={colors.fg3}>Job not found.</Txt>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Txt style={{ color: colors.brand, fontFamily: fonts.displayBold }}>Go back</Txt>
        </Pressable>
      </SafeAreaView>
    );
  }

  const target = applyTarget({
    applyUrl: job.applyUrl ?? channel?.applyUrl,
    applyEmail: job.applyEmail ?? channel?.applyEmail,
  });

  async function onApply() {
    if (applied || !job || gateLoading) return;
    // Free plan: 3 applications within the first week, then subscribe (paid
    // is unlimited). Mirrors the web free-trial gate.
    const trialCtx = { registeredAt: profile.registeredAt, used: usedApplications };
    if (isSupabaseConfigured && !canApply(profile.plan, trialCtx)) {
      const trial = evaluateFreeTrial(trialCtx);
      Alert.alert(
        trial.windowExpired ? 'Free trial ended' : 'Free limit reached',
        freeTrialBlockedMessage(trial),
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Subscribe', onPress: () => router.push('/profile/plans') },
        ],
      );
      return;
    }
    if (target) {
      // External application: open the company site / email, then track it.
      try {
        if (target.type === 'url') await WebBrowser.openBrowserAsync(target.value);
        else await Linking.openURL(`mailto:${target.value}?subject=${encodeURIComponent(`Application: ${job.role}`)}`);
      } catch {
        /* user dismissed / no handler */
      }
      applyTo(job); // applyTo now bumps the daily counter itself (new applies only)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Tracked in your applications.', 'success');
      return;
    }
    applyTo(job);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBurst(true);
  }

  async function onShare() {
    if (!job) return;
    try {
      await Share.share({
        message: `${job.role} at ${job.company} — found on RemoteJobs44. https://remotejobs44.com/jobs/${job.id}`,
      });
    } catch {
      /* user dismissed the share sheet */
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingBottom: 130 + insets.bottom, gap: spacing[4] }}
      >
        {/* Dark hero (§5.4): actions + logo + role + verified + meta chips,
            bled full-width and reaching under the status bar. */}
        <View
          style={{
            marginHorizontal: -spacing.screenX,
            paddingHorizontal: spacing.screenX,
            paddingTop: insets.top + spacing[3],
            paddingBottom: spacing[5],
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            overflow: 'hidden',
            gap: spacing[4],
          }}
        >
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id="jdHero" x1="0" y1="0" x2="0.85" y2="1">
                <Stop offset="0" stopColor="#102a52" />
                <Stop offset="1" stopColor="#0a1730" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#jdHero)" />
          </Svg>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <HeroIcon onPress={() => router.back()} label="Back">
              <ArrowLeft size={18} color="#fff" />
            </HeroIcon>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <HeroIcon onPress={onShare} label="Share">
                <Share2 size={17} color="#fff" />
              </HeroIcon>
              <HeroIcon onPress={() => toggleSaved(job.id)} label={saved ? 'Remove from saved' : 'Save'}>
                <Bookmark size={18} color={saved ? colors.accent : '#fff'} fill={saved ? colors.accent : 'transparent'} />
              </HeroIcon>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <CompanyLogo job={job} size={56} radius={radii.lg} />
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 22, lineHeight: 27, letterSpacing: -0.4, color: '#fff' }} numberOfLines={3}>
                {job.role}
              </Txt>
              {job.verified ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(34,197,94,0.18)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.32)' }}>
                  <BadgeCheck size={13} color="#4ade80" />
                  <Txt style={{ fontFamily: fonts.displayBold, fontSize: 11, color: '#86efac' }}>Verified employer</Txt>
                </View>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <HeroMeta icon={<MapPin size={13} color="rgba(255,255,255,0.7)" />} label={job.location.replace(/^Remote · /, '')} />
            <HeroMeta icon={<Clock size={13} color="rgba(255,255,255,0.7)" />} label={job.type} />
            <HeroMeta label={job.level} />
          </View>
        </View>

        <JobDetailBody job={job} showCompanyRow={false} showMeta={false} />
        <SimilarRoles job={job} />
      </ScrollView>

      {/* fixed apply bar */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: 'row',
          gap: spacing[3],
          paddingHorizontal: spacing.screenX,
          paddingTop: spacing[3],
          paddingBottom: Math.max(spacing[3], insets.bottom),
          backgroundColor: colors.bgApp,
          borderTopWidth: 1,
          borderTopColor: colors.border1,
        }}
      >
        <Pressable
          onPress={() => toggleSaved(job.id)}
          style={({ pressed }) => [
            {
              width: 50,
              height: 50,
              borderRadius: radii.row,
              borderWidth: 1.5,
              borderColor: colors.border2,
              backgroundColor: colors.bgCard,
              alignItems: 'center',
              justifyContent: 'center',
            },
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
        >
          <Bookmark size={20} color={saved ? colors.accent : colors.fg3} fill={saved ? colors.accent : 'transparent'} />
        </Pressable>

        <Pressable
          onPress={onApply}
          disabled={applied || gateLoading}
          style={({ pressed }) => [
            {
              flex: 1,
              height: 50,
              borderRadius: radii.row,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing[2],
              backgroundColor: applied ? colors.success : colors.accent,
              opacity: gateLoading && !applied ? 0.6 : 1,
            },
            applied ? undefined : shadows.accent,
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          {applied ? <Check size={18} color="#fff" /> : target ? <ExternalLink size={18} color="#fff" /> : <Zap size={18} color="#fff" fill="#fff" />}
          <Txt style={{ fontFamily: fonts.displayBold, fontSize: 14, color: '#fff' }}>
            {applied ? 'Applied' : gateLoading ? 'Checking…' : target ? 'Apply on company site' : 'Apply in one tap'}
          </Txt>
        </Pressable>
      </View>

      {/* success burst */}
      {burst ? (
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: colors.success,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: burstAnim,
              transform: [{ scale: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
            }}
          >
            <Check size={48} color="#fff" strokeWidth={3} />
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}
