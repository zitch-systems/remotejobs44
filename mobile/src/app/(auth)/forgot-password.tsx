// src/app/(auth)/forgot-password.tsx — request a password-reset email.
//
// Mirrors the web /forgot-password flow: enter an email, Supabase sends a
// recovery link. The link's redirectTo is a `remotejobs44://reset-password`
// deep link (see lib/auth-links.ts) so tapping it in the inbox reopens the
// app on the "set new password" screen.
//
// SECURITY: we ALWAYS render the "check your inbox" confirmation, regardless
// of whether the address has an account — showing a distinct "no such user"
// error leaks account existence (the same enumeration vector the web app
// closes). Real failures are logged for support, not surfaced to the user.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, Mail, MailCheck } from 'lucide-react-native';
import { Button, Field, Txt } from '@/components/ui';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { resetPasswordRedirectUri } from '@/lib/auth-links';
import { toast } from '@/store/toast';
import { fonts, spacing, useTheme } from '@/theme';

export default function ForgotPassword() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed) {
      toast('Enter your email address.', 'error');
      return;
    }
    // No backend wired (demo mode) → reset can't work. Tell the user plainly
    // rather than faking a confirmation they'd wait on forever.
    if (!isSupabaseConfigured) {
      toast('Password reset needs the live app build.', 'error');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: resetPasswordRedirectUri,
      });
      // Log but DON'T surface — see the security note up top.
      if (error) console.warn('[forgot-password]', error.message);
    } catch (e: any) {
      console.warn('[forgot-password]', e?.message ?? e);
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  // Android: no KeyboardAvoidingView — its keyboard-show re-render blurs the
  // focused input under SDK 56 New Arch. Native pan (app.json) handles it. iOS keeps KAV.
  const Wrap: any = Platform.OS === 'ios' ? KeyboardAvoidingView : React.Fragment;
  const wrapProps: any = Platform.OS === 'ios' ? { style: { flex: 1 }, behavior: 'padding' } : {};

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <Wrap {...wrapProps}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: spacing.authX,
            paddingTop: insets.top + spacing[4],
            paddingBottom: insets.bottom + spacing[6],
          }}
        >
          {/* back to sign in */}
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: spacing[6] }}
          >
            <ArrowLeft size={18} color={colors.fg3} />
            <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 13.5, color: colors.fg3 }}>Back to sign in</Txt>
          </Pressable>

          {sent ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4], paddingBottom: spacing[10] }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.successBg,
                }}
              >
                <MailCheck size={30} color={colors.success} />
              </View>
              <Txt variant="h1" center>
                Check your inbox
              </Txt>
              <Txt center color={colors.fg3} style={{ fontSize: 14, maxWidth: 320 }}>
                If an account exists for <Txt style={{ fontFamily: fonts.displayBold, color: colors.fg2 }}>{email.trim()}</Txt>, we&rsquo;ve
                sent a link to reset your password. Open it on this device to continue.
              </Txt>
              <View style={{ width: '100%', marginTop: spacing[4], gap: spacing[3] }}>
                <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
                <Button
                  label="Use a different email"
                  variant="ghost"
                  onPress={() => {
                    setSent(false);
                    setEmail('');
                  }}
                />
              </View>
            </View>
          ) : (
            <>
              <View style={{ gap: 8, marginBottom: spacing[6] }}>
                <Txt variant="h1">Reset your password</Txt>
                <Txt color={colors.fg3} style={{ fontSize: 14 }}>
                  Enter the email tied to your account and we&rsquo;ll send you a secure link to set a new password.
                </Txt>
              </View>

              <Field
                label="Email"
                placeholder="you@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoFocus
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={submit}
                returnKeyType="send"
                leading={<Mail size={16} color={colors.fg4} />}
              />

              <Button
                label="Send reset link"
                onPress={submit}
                loading={busy}
                icon={<ArrowRight size={18} color="#fff" />}
                style={{ marginTop: spacing[5] }}
              />
            </>
          )}
        </ScrollView>
      </Wrap>
    </View>
  );
}
