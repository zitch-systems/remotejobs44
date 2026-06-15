// src/app/profile/cover-letter.tsx — AI cover-letter writer (ai-cover-letter fn).
// Pro-gated, like the other AI tools.
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, PenLine, Share2 } from 'lucide-react-native';
import { Button, Card, IconButton, Txt } from '@/components/ui';
import { BrandLoader } from '@/components/BrandLoader';
import { PaywallCard } from '@/components/PaywallCard';
import { writeCoverLetter } from '@/lib/ai';
import { useProfile } from '@/lib/profile';
import { canUseAI } from '@/lib/entitlements';
import { isSupabaseConfigured } from '@/lib/supabase';
import { fonts, spacing, useTheme } from '@/theme';

function FieldCard({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <Txt variant="label" color={colors.fg2}>
        {label}
      </Txt>
      {children}
    </View>
  );
}

export default function CoverLetter() {
  const { colors } = useTheme();
  const router = useRouter();
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [cv, setCv] = useState('');
  const [busy, setBusy] = useState(false);
  const [letter, setLetter] = useState('');
  const { profile } = useProfile();
  const gated = isSupabaseConfigured && !canUseAI(profile.plan);

  async function run() {
    if (!isSupabaseConfigured) {
      Alert.alert('Demo mode', 'Connect Supabase + deploy the ai-cover-letter function to use this.');
      return;
    }
    if (role.trim().length < 2) {
      Alert.alert('Add a role', 'Enter the role you’re applying for.');
      return;
    }
    if (cv.trim().length < 50) {
      Alert.alert('Add your CV', 'Paste at least 50 characters of your CV text.');
      return;
    }
    try {
      setBusy(true);
      setLetter(await writeCoverLetter(role.trim(), cv.trim(), company.trim() || undefined));
    } catch (e: any) {
      Alert.alert('Couldn’t generate', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const share = () => {
    if (letter) Share.share({ message: letter }).catch(() => {});
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing.screenX, paddingTop: spacing[2] }}>
        <IconButton accessibilityLabel="Go back" onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2">AI cover letter</Txt>
      </View>

      {gated ? (
        <View style={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[6] }}>
          <PaywallCard
            title="AI cover letters are a Pro feature"
            subtitle="Upgrade to generate a tailored, ready-to-send cover letter for any role from your CV."
          />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[5], gap: spacing[4], paddingBottom: spacing[12] }}
          >
            <FieldCard label="Target role">
              <Card style={{ paddingHorizontal: spacing[4], height: 48, justifyContent: 'center' }}>
                <TextInput
                  value={role}
                  onChangeText={setRole}
                  placeholder="e.g. Senior Frontend Engineer"
                  placeholderTextColor={colors.fg4}
                  style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.fg1 }}
                />
              </Card>
            </FieldCard>

            <FieldCard label="Company (optional)">
              <Card style={{ paddingHorizontal: spacing[4], height: 48, justifyContent: 'center' }}>
                <TextInput
                  value={company}
                  onChangeText={setCompany}
                  placeholder="e.g. Vercel"
                  placeholderTextColor={colors.fg4}
                  style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.fg1 }}
                />
              </Card>
            </FieldCard>

            <FieldCard label="Your CV text">
              <Card style={{ padding: spacing[4] }}>
                <TextInput
                  value={cv}
                  onChangeText={setCv}
                  placeholder="Paste your CV here…"
                  placeholderTextColor={colors.fg4}
                  multiline
                  textAlignVertical="top"
                  style={{ minHeight: 140, fontFamily: fonts.body, fontSize: 13, color: colors.fg1, lineHeight: 20 }}
                />
              </Card>
            </FieldCard>

            <Button label="Write my cover letter" onPress={run} loading={busy} icon={<PenLine size={18} color="#fff" />} />

            {busy ? (
              <View style={{ paddingVertical: spacing[8], alignItems: 'center' }}>
                <BrandLoader label="Writing your cover letter…" />
              </View>
            ) : letter ? (
              <Card style={{ padding: spacing[4], gap: spacing[3] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt variant="h3" color={colors.fg1}>
                    Your cover letter
                  </Txt>
                  <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share cover letter" hitSlop={8}>
                    <Share2 size={18} color={colors.brand} />
                  </Pressable>
                </View>
                <Txt selectable color={colors.fg2} style={{ fontSize: 14, lineHeight: 22 }}>
                  {letter}
                </Txt>
              </Card>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
