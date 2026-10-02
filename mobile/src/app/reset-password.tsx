// src/app/reset-password.tsx — set a new password after tapping the recovery
// link from the inbox.
//
// Lives at the app ROOT (not inside the (auth) group) on purpose: completing
// the recovery establishes a real session, which would make (auth)/_layout
// bounce the user to the tabs before they can set a password. At the root there
// is no such guard, so the screen stays put while we exchange the link's token.
//
// Flow:
//   1. The recovery email redirects to `remotejobs44://reset-password?code=…`
//      (PKCE) — see lib/auth-links.ts. expo-router opens this screen.
//   2. We read the full URL (Linking.useURL — works on cold + warm start),
//      exchange the `code` for a session (or verify a `token_hash`, matching
//      the web /auth/callback fallback), then reveal the password form.
//   3. updateUser({ password }) sets the new password on the recovery session.
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import type { EmailOtpType } from '@supabase/supabase-js';
import { ArrowLeft, Check, Eye, EyeOff, Lock, ShieldAlert } from 'lucide-react-native';
import { Button, Field, Txt } from '@/components/ui';
import { BrandLoaderScreen } from '@/components/BrandLoader';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { parseAuthCallbackUrl, recoveryCallback } from '@/lib/auth-callback';
import { toast } from '@/store/toast';
import { fonts, spacing, useTheme } from '@/theme';

type Phase = 'verifying' | 'ready' | 'error';

export default function ResetPassword() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const url = Linking.useURL();
  const processed = useRef<Set<string>>(new Set());
  const [initialUrl, setInitialUrl] = useState<string | null | undefined>(undefined);

  const [phase, setPhase] = useState<Phase>(isSupabaseConfigured ? 'verifying' : 'error');
  const [errMsg, setErrMsg] = useState(
    isSupabaseConfigured ? '' : 'Password reset needs the live app build.',
  );

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  // Supabase may also emit PASSWORD_RECOVERY while exchanging the link.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPhase('ready');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // useURL can be null when this route is opened without a link. Resolve the
  // cold-start URL as a fallback, then fail closed instead of spinning forever.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    Linking.getInitialURL()
      .then((value) => {
        if (active) setInitialUrl(value);
      })
      .catch(() => {
        if (active) setInitialUrl(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'verifying' || url || initialUrl !== null) return;
    const timer = setTimeout(() => {
      setErrMsg('Open the reset link from your email to continue.');
      setPhase('error');
    }, 1500);
    return () => clearTimeout(timer);
  }, [initialUrl, phase, url]);

  // Exchange the token carried by the deep link for a recovery session.
  useEffect(() => {
    const callbackUrl = url ?? initialUrl;
    if (!callbackUrl || !isSupabaseConfigured) return;
    if (processed.current.has(callbackUrl)) return;
    processed.current.add(callbackUrl);

    (async () => {
      // Supabase can return values in either the query string or URL fragment.
      const callback = recoveryCallback(parseAuthCallbackUrl(callbackUrl));
      if (callback.kind === 'error' || callback.kind === 'invalid') {
        setErrMsg('This reset link is invalid or has expired. Request a new one.');
        setPhase('error');
        return;
      }
      try {
        if (callback.kind === 'code') {
          const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
          if (error) throw error;
          setPhase('ready');
        } else if (callback.kind === 'otp') {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: callback.tokenHash,
            type: 'recovery' as EmailOtpType,
          });
          if (error) throw error;
          setPhase('ready');
        } else if (callback.kind === 'session') {
          const { error } = await supabase.auth.setSession({
            access_token: callback.accessToken,
            refresh_token: callback.refreshToken,
          });
          if (error) throw error;
          setPhase('ready');
        }
      } catch (e: any) {
        console.warn('[reset-password] exchange failed:', e?.message ?? e);
        setErrMsg('This reset link is invalid or has expired. Request a new one.');
        setPhase('error');
      }
    })();
  }, [initialUrl, url]);

  async function submit() {
    if (password.length < 8) {
      toast('Password must be at least 8 characters.', 'error');
      return;
    }
    if (password !== confirm) {
      toast('Passwords do not match.', 'error');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast('Password updated.', 'success');
      // The recovery session is now a full session — drop the user into the app.
      router.replace('/(tabs)');
    } catch (e: any) {
      console.warn('[reset-password] update failed:', e?.message ?? e);
      toast('Could not update password. Please try again.', 'error');
      setBusy(false);
    }
  }

  if (phase === 'verifying') return <BrandLoaderScreen label="Verifying your reset link…" />;

  if (phase === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgApp, paddingHorizontal: spacing.authX, paddingTop: insets.top }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4], paddingBottom: spacing[10] }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(220,38,38,0.12)',
            }}
          >
            <ShieldAlert size={30} color={colors.danger} />
          </View>
          <Txt variant="h1" center>
            Link expired
          </Txt>
          <Txt center color={colors.fg3} style={{ fontSize: 14, maxWidth: 320 }}>
            {errMsg}
          </Txt>
          <View style={{ width: '100%', marginTop: spacing[4], gap: spacing[3] }}>
            <Button label="Request a new link" onPress={() => router.replace('/(auth)/forgot-password')} />
            <Button label="Back to sign in" variant="ghost" onPress={() => router.replace('/(auth)/sign-in')} />
          </View>
        </View>
      </View>
    );
  }

  // phase === 'ready'
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
          <Pressable
            onPress={() => router.replace('/(auth)/sign-in')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: spacing[6] }}
          >
            <ArrowLeft size={18} color={colors.fg3} />
            <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 13.5, color: colors.fg3 }}>Back to sign in</Txt>
          </Pressable>

          <View style={{ gap: 8, marginBottom: spacing[6] }}>
            <Txt variant="h1">Set a new password</Txt>
            <Txt color={colors.fg3} style={{ fontSize: 14 }}>
              Choose a strong password you don&rsquo;t use anywhere else. At least 8 characters.
            </Txt>
          </View>

          <View style={{ gap: 13 }}>
            <Field
              label="New password"
              placeholder="At least 8 characters"
              secureTextEntry={!show}
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              leading={<Lock size={16} color={colors.fg4} />}
              trailing={
                <Pressable hitSlop={8} onPress={() => setShow((s) => !s)} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={16} color={colors.fg4} /> : <Eye size={16} color={colors.fg4} />}
                </Pressable>
              }
            />
            <Field
              label="Confirm password"
              placeholder="Repeat your password"
              secureTextEntry={!show}
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              value={confirm}
              onChangeText={setConfirm}
              onSubmitEditing={submit}
              returnKeyType="done"
              leading={<Lock size={16} color={colors.fg4} />}
            />
          </View>

          <Button
            label="Update password"
            onPress={submit}
            loading={busy}
            disabled={!password || !confirm}
            icon={<Check size={18} color="#fff" />}
            style={{ marginTop: spacing[5] }}
          />
        </ScrollView>
      </Wrap>
    </View>
  );
}
