// src/app/(auth)/sign-in.tsx — Auth front door (handoff §1).
// Segmented Sign in / Create account, email+password (real Supabase auth when
// configured, demo otherwise), social placeholders, footer toggle + trust line.
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ArrowRight, Eye, EyeOff, Lock, Mail, Search, ShieldCheck, User } from 'lucide-react-native';
import { Button, Divider, Field, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { signInWithProvider } from '@/lib/oauth';
import { SEED_USER } from '@/lib/seed';
import { fonts, palette, radii, shadows, spacing, useTheme } from '@/theme';

type Mode = 'signin' | 'signup';

function BrandMark() {
  return (
    <View style={{ alignItems: 'center', gap: spacing[3] }}>
      <View style={[{ width: 54, height: 54, borderRadius: 17, overflow: 'hidden' }, shadows.primary]}>
        <Svg width={54} height={54} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={palette.brand600} />
              <Stop offset="1" stopColor={palette.brand700} />
            </LinearGradient>
          </Defs>
          <Rect width={54} height={54} rx={17} fill="url(#brand)" />
        </Svg>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Search size={26} color="#fff" strokeWidth={2.4} />
        </View>
      </View>
      <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 16 }}>
        RemoteJobs<Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 16, color: palette.accent }}>44</Txt>
      </Txt>
    </View>
  );
}

function Segmented({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const { colors } = useTheme();
  const seg = (m: Mode, label: string) => {
    const active = mode === m;
    return (
      <Pressable
        onPress={() => onChange(m)}
        style={[
          { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
          active && { backgroundColor: colors.bgCard, ...shadows.field },
        ]}
      >
        <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 14, color: active ? colors.fg1 : colors.fg3 }}>
          {label}
        </Txt>
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: radii.field, backgroundColor: colors.bgSection }}>
      {seg('signin', 'Sign in')}
      {seg('signup', 'Create account')}
    </View>
  );
}

export default function SignIn() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { configured, enterDemo } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  // Only pre-fill the demo email in demo mode; real builds start empty.
  const [email, setEmail] = useState(isSupabaseConfigured ? '' : SEED_USER.email);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  async function submit() {
    // No backend wired → demo straight into the app (handoff behavior).
    if (!configured) {
      enterDemo();
      return;
    }
    if (!email || !password) {
      Alert.alert('Missing details', 'Enter your email and password to continue.');
      return;
    }
    setBusy(true);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (error) throw error;
        if (!data.session) {
          Alert.alert('Confirm your email', 'We sent you a verification link. Confirm it, then sign in.');
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // On success the auth listener flips `authed` and (auth)/_layout redirects.
    } catch (e: any) {
      Alert.alert('Sign-in failed', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: 'google' | 'linkedin') {
    // No backend wired → demo straight in.
    if (!configured) return enterDemo();
    try {
      setBusy(true);
      await signInWithProvider(provider === 'google' ? 'google' : 'linkedin_oidc');
      // On success the auth listener flips `authed` and (auth)/_layout redirects.
    } catch (e: any) {
      Alert.alert('Sign-in failed', e?.message ?? 'Could not complete social sign-in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgApp }}>
      {/* soft blue radial glow behind the top */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -120,
          left: -40,
          right: -40,
          height: 320,
          borderRadius: 999,
          backgroundColor: 'rgba(37,99,235,0.16)',
          opacity: 0.6,
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: spacing.authX,
            paddingTop: insets.top + spacing[8],
            paddingBottom: insets.bottom + spacing[6],
          }}
        >
          <BrandMark />

          <View style={{ marginTop: spacing[8], gap: 6 }}>
            <Txt variant="h1" center>
              {isSignup ? 'Create your account' : 'Welcome back'}
            </Txt>
            <Txt center color={colors.fg3} style={{ fontSize: 13.5 }}>
              {isSignup
                ? 'Join 40,000+ remote workers finding verified roles across Africa.'
                : 'Sign in to pick up your job search where you left off.'}
            </Txt>
          </View>

          <View style={{ marginTop: spacing[6] }}>
            <Segmented mode={mode} onChange={setMode} />
          </View>

          <View style={{ marginTop: spacing[5], gap: 13 }}>
            {isSignup ? (
              <Field
                label="Full name"
                placeholder="Ada Obi"
                autoCapitalize="words"
                value={name}
                onChangeText={setName}
                leading={<User size={16} color={colors.fg4} />}
              />
            ) : null}
            <Field
              label="Email"
              placeholder="you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              leading={<Mail size={16} color={colors.fg4} />}
            />
            <Field
              label="Password"
              placeholder={isSignup ? 'Create a password' : '••••••••'}
              secureTextEntry={!show}
              value={password}
              onChangeText={setPassword}
              leading={<Lock size={16} color={colors.fg4} />}
              trailing={
                <Pressable hitSlop={8} onPress={() => setShow((s) => !s)}>
                  {show ? <EyeOff size={16} color={colors.fg4} /> : <Eye size={16} color={colors.fg4} />}
                </Pressable>
              }
            />
            {!isSignup ? (
              <Pressable style={{ alignSelf: 'flex-end' }} onPress={() => Alert.alert('Reset password', 'Password reset flow goes here.')}>
                <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 12.5, color: colors.brand }}>Forgot password?</Txt>
              </Pressable>
            ) : null}

            <Button
              label={isSignup ? 'Create account' : 'Sign in'}
              onPress={submit}
              loading={busy}
              icon={<ArrowRight size={18} color="#fff" />}
            />
          </View>

          {/* divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginVertical: spacing[5] }}>
            <Divider style={{ flex: 1 }} />
            <Txt variant="eyebrow" color={colors.fg4}>
              Or continue with
            </Txt>
            <Divider style={{ flex: 1 }} />
          </View>

          {/* social */}
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <SocialButton label="Google" tile="#fff" tileBorder mark="G" markColor="#4285f4" onPress={() => social('google')} />
            <SocialButton label="LinkedIn" tile="#0a66c2" mark="in" markColor="#fff" onPress={() => social('linkedin')} />
          </View>

          {/* footer toggle */}
          <View style={{ marginTop: 'auto', paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
            <Pressable onPress={() => setMode(isSignup ? 'signin' : 'signup')}>
              <Txt center color={colors.fg3} style={{ fontSize: 13.5 }}>
                {isSignup ? 'Already have an account? ' : 'New to RemoteJobs44? '}
                <Txt style={{ fontFamily: fonts.displayBold, fontSize: 13.5, color: colors.brandStrong }}>
                  {isSignup ? 'Sign in' : 'Create account'}
                </Txt>
              </Txt>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={13} color={colors.success} />
              <Txt variant="meta" color={colors.fg4}>
                Bank-grade security · verified employers only
              </Txt>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SocialButton({
  label,
  tile,
  tileBorder,
  mark,
  markColor,
  onPress,
}: {
  label: string;
  tile: string;
  tileBorder?: boolean;
  mark: string;
  markColor: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          height: 47,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing[2],
          borderRadius: radii.field,
          backgroundColor: colors.bgCard,
          borderWidth: 1.5,
          borderColor: colors.border2,
        },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <View
        style={{
          width: 21,
          height: 21,
          borderRadius: 6,
          backgroundColor: tile,
          borderWidth: tileBorder ? 1 : 0,
          borderColor: colors.border2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 11, color: markColor }}>{mark}</Txt>
      </View>
      <Txt style={{ fontFamily: fonts.displayBold, fontSize: 13.5, color: colors.fg2 }}>{label}</Txt>
    </Pressable>
  );
}
