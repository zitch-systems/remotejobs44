// src/app/job/[id].tsx — phone job-detail route: header + shared body + fixed
// apply bar + success burst (handoff §3). Content lives in <JobDetailBody/>.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Bookmark, Check, Share2, Zap } from 'lucide-react-native';
import { IconButton, Txt } from '@/components/ui';
import { JobDetailBody } from '@/components/JobDetailBody';
import { SEED_JOBS } from '@/lib/seed';
import { useAppStore } from '@/store/app';
import { fonts, radii, shadows, spacing, useTheme } from '@/theme';

export default function JobDetail() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const job = SEED_JOBS.find((j) => j.id === id);
  const saved = useAppStore((s) => (job ? s.saved.includes(job.id) : false));
  const applied = useAppStore((s) => (job ? job.id in s.applied : false));
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const applyTo = useAppStore((s) => s.applyTo);

  const [burst, setBurst] = useState(false);
  const burstAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!burst) return;
    burstAnim.setValue(0);
    Animated.spring(burstAnim, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
    const t = setTimeout(() => setBurst(false), 1100);
    return () => clearTimeout(t);
  }, [burst, burstAnim]);

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

  function onApply() {
    if (applied || !job) return;
    applyTo(job.id);
    setBurst(true);
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
          <IconButton>
            <Share2 size={17} color={colors.fg1} />
          </IconButton>
        </View>

        <JobDetailBody job={job} />
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
          {applied ? <Check size={18} color="#fff" /> : <Zap size={18} color="#fff" fill="#fff" />}
          <Txt style={{ fontFamily: fonts.displayBold, fontSize: 14, color: '#fff' }}>
            {applied ? 'Applied' : 'Apply in one tap'}
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
