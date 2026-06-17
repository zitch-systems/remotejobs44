// src/app/(auth)/forgot-password.tsx — request a password-reset link.
// Real Supabase recovery when configured; a neutral confirmation either way so
// we never reveal whether an email has an account.
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, CheckCircle2, Mail } from 'lucide-react-native';
import { Button, Field, Txt } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { sendPasswordReset } from '@/lib/password-reset';
import { fonts, spacing, useTheme } from '@/theme';

export default function ForgotPassword() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Enter your email', 'We need your email to send a reset link.');
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert('Not available', 'Password reset needs the live backend, which isn’t wired up in this build.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(trimmed);
      setSent(true);
    } catch (e: any) {
      Alert.alert('Could not send reset link', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: spacing.authX,
            paddingTop: insets.top + spacing[4],
            paddingBottom: insets.bottom + spacing[6],
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: spacing[6] }}
          >
            <ArrowLeft size={18} color={colors.fg3} />
            <Txt color={colors.fg3} style={{ fontFamily: fonts.displaySemibold, fontSize: 14 }}>
              Back
            </Txt>
          </Pressable>

          {sent ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing[4], paddingBottom: spacing[10] }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(16,185,129,0.14)',
                }}
              >
                <CheckCircle2 size={32} color={colors.success} />
              </View>
              <Txt variant="h1" center>
                Check your email
              </Txt>
              <Txt center color={colors.fg3} style={{ fontSize: 14, lineHeight: 21 }}>
                If an account exists for{'\n'}
                <Txt style={{ fontFamily: fonts.displaySemibold, color: colors.fg2 }}>{email.trim()}</Txt>
                {'\n'}we’ve sent a link to reset your password. Open it on this device to continue.
              </Txt>
              <View style={{ height: spacing[2] }} />
              <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} icon={<ArrowRight size={18} color="#fff" />} />
              <Pressable hitSlop={8} onPress={() => setSent(false)}>
                <Txt color={colors.brand} style={{ fontFamily: fonts.displaySemibold, fontSize: 13.5 }}>
                  Use a different email
                </Txt>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <Txt variant="h1">Reset your password</Txt>
                <Txt color={colors.fg3} style={{ fontSize: 14, lineHeight: 21 }}>
                  Enter the email you use for RemoteJobs44 and we’ll send you a link to set a new password.
                </Txt>
              </View>

              <View style={{ marginTop: spacing[6], gap: 13 }}>
                <Field
                  label="Email"
                  placeholder="you@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                  returnKeyType="send"
                  onSubmitEditing={submit}
                  leading={<Mail size={16} color={colors.fg4} />}
                />
                <Button
                  label="Send reset link"
                  onPress={submit}
                  loading={busy}
                  icon={<ArrowRight size={18} color="#fff" />}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
