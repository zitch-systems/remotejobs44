// src/app/reset-password.tsx — set a new password from a recovery link.
//
// Top-level (NOT in the (auth) group) on purpose: exchanging the recovery code
// creates a real session, and the (auth) layout would immediately bounce a
// signed-in user to the tabs — so this screen lives outside that gate. It's
// reached only via usePasswordRecoveryLink() (see lib/password-reset.ts).
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native';
import { Button, Field, Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { toast } from '@/store/toast';
import { fonts, spacing, useTheme } from '@/theme';

type Phase = 'verifying' | 'ready' | 'error';
const MIN_LEN = 8;

export default function ResetPassword() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();

  const [phase, setPhase] = useState<Phase>('verifying');
  const [errMsg, setErrMsg] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  // Verify the recovery link: exchange the code for a session (or fall back to
  // an existing recovery session) before letting the user set a new password.
  useEffect(() => {
    let active = true;
    (async () => {
      if (params.error) {
        if (active) {
          setErrMsg(String(params.error));
          setPhase('error');
        }
        return;
      }
      const code = typeof params.code === 'string' ? params.code : '';
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (error) {
          setErrMsg(error.message || 'This reset link is invalid or has expired.');
          setPhase('error');
        } else {
          setPhase('ready');
        }
        return;
      }
      // No code in the link — maybe a recovery session is already active.
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) setPhase('ready');
      else {
        setErrMsg('This reset link is invalid or has expired. Request a new one.');
        setPhase('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [params.code, params.error]);

  async function save() {
    if (password.length < MIN_LEN) {
      Alert.alert('Password too short', `Use at least ${MIN_LEN} characters.`);
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords don’t match', 'Re-enter the same password in both fields.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast('Password updated — you’re signed in', 'success');
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Could not update password', e?.message ?? 'Please try again.');
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
            justifyContent: 'center',
            paddingHorizontal: spacing.authX,
            paddingTop: insets.top + spacing[6],
            paddingBottom: insets.bottom + spacing[6],
          }}
        >
          {phase === 'verifying' ? (
            <Txt center color={colors.fg3} style={{ fontSize: 14 }}>
              Verifying your reset link…
            </Txt>
          ) : phase === 'error' ? (
            <View style={{ gap: spacing[4], alignItems: 'center' }}>
              <Txt variant="h1" center>
                Link expired
              </Txt>
              <Txt center color={colors.fg3} style={{ fontSize: 14, lineHeight: 21 }}>
                {errMsg || 'This password reset link is invalid or has expired.'}
              </Txt>
              <Button
                label="Request a new link"
                onPress={() => router.replace('/(auth)/forgot-password')}
                icon={<ArrowRight size={18} color="#fff" />}
              />
            </View>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <Txt variant="h1">Set a new password</Txt>
                <Txt color={colors.fg3} style={{ fontSize: 14, lineHeight: 21 }}>
                  Choose a strong password — at least {MIN_LEN} characters.
                </Txt>
              </View>

              <View style={{ marginTop: spacing[6], gap: 13 }}>
                <Field
                  label="New password"
                  placeholder="Create a password"
                  secureTextEntry={!show}
                  autoCapitalize="none"
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
                  placeholder="Re-enter password"
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  value={confirm}
                  onChangeText={setConfirm}
                  returnKeyType="done"
                  onSubmitEditing={save}
                  leading={<Lock size={16} color={colors.fg4} />}
                />
                <Button label="Update password" onPress={save} loading={busy} icon={<ArrowRight size={18} color="#fff" />} />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing[6] }}>
                <ShieldCheck size={13} color={colors.success} />
                <Txt variant="meta" color={colors.fg4}>
                  Your password is encrypted end to end
                </Txt>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
