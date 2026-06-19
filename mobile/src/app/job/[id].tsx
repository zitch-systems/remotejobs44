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
import { canApply, FREE_DAILY_APPLICATIONS } from '@/lib/entitlements';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store/app';
import { useUsage } from '@/store/usage';
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
  const { profile } = useProfile();
  const usedToday = useUsage((s) => s.todayApplications());
  const bumpApplication = useUsage((s) => s.bumpApplication);

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
    if (applied || !job) return;
    // Free plan: cap applications per day (paid is unlimited).
    if (isSupabaseConfigured && !canApply(profile.plan, usedToday)) {
      Alert.alert(
        'Daily limit reached',
        `Free accounts can apply to ${FREE_DAILY_APPLICATIONS} roles a day. Upgrade to Pro for unlimited applications.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/profile/plans') },
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
      applyTo(job);
      bumpApplication();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Tracked in your applications.', 'success');
      return;
    }
    applyTo(job);
    bumpApplication();
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
          disabled={applied}
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
            },
            applied ? undefined : shadows.accent,
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          {applied ? <Check size={18} color="#fff" /> : target ? <ExternalLink size={18} color="#fff" /> : <Zap size={18} color="#fff" fill="#fff" />}
          <Txt style={{ fontFamily: fonts.displayBold, fontSize: 14, color: '#fff' }}>
            {applied ? 'Applied' : target ? 'Apply on company site' : 'Apply in one tap'}
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
