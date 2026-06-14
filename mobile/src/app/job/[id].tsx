// src/app/job/[id].tsx — full job detail + one-tap apply (handoff §3).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Bookmark, Check, Share2, Zap } from 'lucide-react-native';
import { Card, IconButton, LogoTile, Pill, Txt } from '@/components/ui';
import { MatchRing } from '@/components/MatchRing';
import { SEED_JOBS } from '@/lib/seed';
import { useAppStore } from '@/store/app';
import { fonts, radii, shadows, spacing, useTheme } from '@/theme';

function verdictKicker(match: number) {
  if (match >= 85) return 'Strong match';
  if (match >= 75) return 'Good match';
  return 'Fair match';
}

function MetaCard({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, padding: spacing[3], gap: 2 }}>
      <Txt variant="eyebrow" color={colors.fg4}>
        {label}
      </Txt>
      <Txt variant="cardTitle" color={colors.fg1} numberOfLines={1}>
        {value}
      </Txt>
    </Card>
  );
}

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

        {/* company row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <LogoTile initial={job.logo} grad={job.grad} size={54} radius={radii.lg} />
          <View style={{ flex: 1 }}>
            <Txt variant="h2" numberOfLines={2}>
              {job.role}
            </Txt>
            <Txt variant="meta" color={colors.fg3}>
              {job.company}
              {job.verified ? ' · Verified employer' : ''}
            </Txt>
          </View>
        </View>

        {/* meta cards */}
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <MetaCard label="Location" value={job.location.replace(/^Remote · /, '')} />
          <MetaCard label="Type" value={job.type} />
          <MetaCard label="Level" value={job.level} />
        </View>

        {/* match band */}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4], padding: spacing[4] }}>
          <MatchRing pct={job.match} size={78} />
          <View style={{ flex: 1, gap: 3 }}>
            <Txt variant="eyebrow" color={colors.success}>
              {verdictKicker(job.match)}
            </Txt>
            <Txt variant="h3" color={colors.fg1}>
              {job.verdict}
            </Txt>
            <Txt variant="meta" color={colors.fg3}>
              {job.vcap}
            </Txt>
          </View>
        </Card>

        {/* about */}
        <Section title="About the role">
          <Txt color={colors.fg2} style={{ fontSize: 14, lineHeight: 22 }}>
            {job.about}
          </Txt>
        </Section>

        {/* duties */}
        <Section title="What you'll do">
          <View style={{ gap: spacing[2] }}>
            {job.duties.map((d, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 7 }} />
                <Txt color={colors.fg2} style={{ flex: 1, fontSize: 14, lineHeight: 21 }}>
                  {d}
                </Txt>
              </View>
            ))}
          </View>
        </Section>

        {/* skills */}
        <Section title="Skills">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {job.skills.map((s) => (
              <Pill key={s} label={s} bg={colors.infoBg} fg={colors.infoText} />
            ))}
          </View>
        </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing[3] }}>
      <Txt variant="h3" color={colors.fg1}>
        {title}
      </Txt>
      {children}
    </View>
  );
}
