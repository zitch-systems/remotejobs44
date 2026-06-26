// src/app/job/[id].tsx — phone job-detail route: header + shared body + fixed
// apply bar + success burst (handoff §3). Content lives in <JobDetailBody/>.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Bookmark, Check, ExternalLink, Share2, Zap } from 'lucide-react-native';
import { IconButton, Txt } from '@/components/ui';
import { BrandLoaderScreen } from '@/components/BrandLoader';
import { JobDetailBody } from '@/components/JobDetailBody';
import { SimilarRoles } from '@/components/SimilarRoles';
import { useJob } from '@/lib/jobs';
import { applyTarget } from '@/lib/apply';
import { useProfile } from '@/lib/profile';
import { canApply, freeTrialBlockedMessage } from '@/lib/entitlements';
import { evaluateFreeTrial } from '@/lib/free-trial';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store/app';
import { useRecentJobs } from '@/store/recent-jobs';
import { toast } from '@/store/toast';
import { fonts, radii, shadows, spacing, useTheme } from '@/theme';

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

  const target = applyTarget(job);

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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingBottom: 130 + insets.bottom, gap: spacing[4] }}
      >
        {/* hero actions */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing[2] }}>
          <IconButton onPress={() => router.back()}>
            <ArrowLeft size={18} color={colors.fg1} />
          </IconButton>
          <IconButton onPress={onShare}>
            <Share2 size={17} color={colors.fg1} />
          </IconButton>
        </View>

        <JobDetailBody job={job} />
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
    </SafeAreaView>
  );
}
