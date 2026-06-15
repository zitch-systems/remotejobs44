// src/app/profile/ai-review.tsx — AI CV review (calls the ai-cv-review edge fn).
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Sparkles, X } from 'lucide-react-native';
import { Button, Card, IconButton, Pill, Txt } from '@/components/ui';
import { BrandLoader } from '@/components/BrandLoader';
import { MatchRing } from '@/components/MatchRing';
import { reviewCv, type CvReview } from '@/lib/ai';
import { isSupabaseConfigured } from '@/lib/supabase';
import { fonts, spacing, useTheme } from '@/theme';

export default function AiReview() {
  const { colors } = useTheme();
  const router = useRouter();
  const [role, setRole] = useState('');
  const [cv, setCv] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<CvReview | null>(null);

  async function run() {
    if (!isSupabaseConfigured) {
      Alert.alert('Demo mode', 'Connect Supabase + deploy the ai-cv-review function to use this.');
      return;
    }
    if (cv.trim().length < 50) {
      Alert.alert('Add your CV', 'Paste at least 50 characters of your CV text.');
      return;
    }
    try {
      setBusy(true);
      setReview(await reviewCv(cv.trim(), role.trim() || 'Remote'));
    } catch (e: any) {
      Alert.alert('Review failed', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing.screenX, paddingTop: spacing[2] }}>
        <IconButton onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2">AI CV review</Txt>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[5], gap: spacing[4], paddingBottom: spacing[12] }}
        >
          <View style={{ gap: 7 }}>
            <Txt variant="label" color={colors.fg2}>
              Target role
            </Txt>
            <Card style={{ paddingHorizontal: spacing[4], height: 48, justifyContent: 'center' }}>
              <TextInput
                value={role}
                onChangeText={setRole}
                placeholder="e.g. Senior Frontend Engineer"
                placeholderTextColor={colors.fg4}
                style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.fg1 }}
              />
            </Card>
          </View>

          <View style={{ gap: 7 }}>
            <Txt variant="label" color={colors.fg2}>
              Your CV text
            </Txt>
            <Card style={{ padding: spacing[4] }}>
              <TextInput
                value={cv}
                onChangeText={setCv}
                placeholder="Paste your CV here…"
                placeholderTextColor={colors.fg4}
                multiline
                textAlignVertical="top"
                style={{ minHeight: 150, fontFamily: fonts.body, fontSize: 13, color: colors.fg1, lineHeight: 20 }}
              />
            </Card>
          </View>

          <Button label="Review my CV" onPress={run} loading={busy} icon={<Sparkles size={18} color="#fff" />} />

          {busy ? (
            <View style={{ paddingVertical: spacing[8], alignItems: 'center' }}>
              <BrandLoader label="Reviewing your CV…" />
            </View>
          ) : review ? (
            <View style={{ gap: spacing[4] }}>
              {/* score + summary */}
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4], padding: spacing[4] }}>
                <MatchRing pct={review.overall_score} size={76} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt variant="eyebrow" color={colors.success}>
                    Overall score
                  </Txt>
                  <Txt color={colors.fg2} style={{ fontSize: 13.5, lineHeight: 19 }}>
                    {review.headline_summary}
                  </Txt>
                </View>
              </Card>

              <Section title="Strengths">
                {review.strengths.map((s, i) => (
                  <Bullet key={i} icon={<Check size={15} color={colors.success} />} text={s} />
                ))}
              </Section>

              <Section title="Gaps">
                {review.gaps.map((g, i) => (
                  <Bullet key={i} icon={<X size={15} color={colors.warnText} />} text={g} />
                ))}
              </Section>

              <Section title="Rewrite tips">
                {review.rewrite_tips.map((t, i) => (
                  <View key={i} style={{ gap: 2 }}>
                    <Txt variant="eyebrow" color={colors.brand}>
                      {t.section}
                    </Txt>
                    <Txt color={colors.fg2} style={{ fontSize: 13.5, lineHeight: 19 }}>
                      {t.tip}
                    </Txt>
                  </View>
                ))}
              </Section>

              {review.ats_keywords_missing.length > 0 ? (
                <Section title="Missing ATS keywords">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {review.ats_keywords_missing.map((k) => (
                      <Pill key={k} label={k} bg={colors.warnBg} fg={colors.warnText} border={colors.warnBorder} />
                    ))}
                  </View>
                </Section>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
      <Card style={{ padding: spacing[4], gap: spacing[3] }}>{children}</Card>
    </View>
  );
}

function Bullet({ icon, text }: { icon: React.ReactNode; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      <Txt color={colors.fg2} style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>
        {text}
      </Txt>
    </View>
  );
}
