// src/app/(auth)/sign-in.tsx — Auth front door (handoff §1).
// Segmented Sign in / Create account, email+password (real Supabase auth when
// configured, demo otherwise), social placeholders, footer toggle + trust line.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, User } from 'lucide-react-native';
import { Button, Divider, Field, Txt } from '@/components/ui';
import { Dialog, type DialogData } from '@/components/Dialog';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { signInWithProvider } from '@/lib/oauth';
import { SEED_USER } from '@/lib/seed';
import { fonts, palette, radii, shadows, spacing, useTheme } from '@/theme';

type Mode = 'signin' | 'signup';

// §5.1 hero logo tile: blue rounded square + white squiggle mark + orange dot
// (mirrors the web header mark).
function HeroLogo() {
  return (
    <View style={[{ width: 52, height: 52, borderRadius: 15, overflow: 'hidden' }, shadows.primary]}>
      <Svg width={52} height={52} viewBox="0 0 40 40">
        <Defs>
          <LinearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.brand500} />
            <Stop offset="1" stopColor={palette.brand700} />
          </LinearGradient>
        </Defs>
        <Rect width={40} height={40} rx={11} fill="url(#logo)" />
        <Path d="M10 26 Q15 12 20 20 Q25 28 29 15" stroke="#fff" strokeWidth={3} strokeLinecap="round" fill="none" />
        <Circle cx={29} cy={15} r={3.5} fill={palette.accent} />
      </Svg>
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
  const router = useRouter();
  const { configured, enterDemo } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  // Only pre-fill the demo email in demo mode; real builds start empty.
  const [email, setEmail] = useState(isSupabaseConfigured ? '' : SEED_USER.email);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogData | null>(null);

  const isSignup = mode === 'signup';

  async function submit() {
    // No backend wired → demo straight into the app (handoff behavior).
    if (!configured) {
      enterDemo();
      return;
    }
    if (!email || !password) {
      setDialog({ title: 'Missing details', message: 'Enter your email and password to continue.', tone: 'info' });
      return;
    }
    setBusy(true);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (error) throw error;
        if (!data.session) {
          setDialog({
            title: 'Confirm your email',
            message: 'We sent you a verification link. Confirm it, then sign in.',
            tone: 'success',
          });
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // On success the auth listener flips `authed` and (auth)/_layout redirects.
    } catch (e: any) {
      setDialog({ title: 'Sign-in failed', message: e?.message ?? 'Please try again.', tone: 'error' });
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
      setDialog({ title: 'Sign-in failed', message: e?.message ?? 'Could not complete social sign-in.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // Android: render the form WITHOUT KeyboardAvoidingView. RN's KAV stays
  // mounted and re-renders the whole subtree on every keyboard show/hide event
  // even when behavior is undefined — and under SDK 56's New Architecture that
  // re-render at keyboard-show time blurs the focused input, so the keyboard
  // closed the instant it opened. Native softwareKeyboardLayoutMode:"pan"
  // (app.json) keeps the field visible on Android instead. iOS keeps KAV.
  const Wrap: any = Platform.OS === 'ios' ? KeyboardAvoidingView : React.Fragment;
  const wrapProps: any = Platform.OS === 'ios' ? { style: { flex: 1 }, behavior: 'padding' } : {};

  return (
    // Deep-navy base so the hero reads as a full-bleed band with the white
    // card sliding up over it (§5.1).
    <View style={{ flex: 1, backgroundColor: '#0a1730' }}>
      <Wrap {...wrapProps}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {/* Navy hero — gradient + orange glow + logo + headline. */}
          <View
            style={{
              overflow: 'hidden',
              paddingTop: insets.top + spacing[8],
              paddingHorizontal: spacing.authX,
              paddingBottom: spacing[10],
            }}
          >
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
              <Defs>
                <LinearGradient id="heroBg" x1="0" y1="0" x2="0.7" y2="1">
                  <Stop offset="0" stopColor="#102a52" />
                  <Stop offset="1" stopColor="#070f1f" />
                </LinearGradient>
                <RadialGradient id="heroGlow" cx="0.82" cy="0.12" r="0.65">
                  <Stop offset="0" stopColor="rgba(249,115,22,0.32)" />
                  <Stop offset="1" stopColor="rgba(249,115,22,0)" />
                </RadialGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#heroBg)" />
              <Rect width="100%" height="100%" fill="url(#heroGlow)" />
            </Svg>

            <HeroLogo />
            <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 26, lineHeight: 31, letterSpacing: -0.6, color: '#fff', marginTop: spacing[5] }}>
              The world&apos;s remote jobs,{'\n'}
              <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 26, lineHeight: 31, letterSpacing: -0.6, color: palette.accentLight }}>in your pocket.</Txt>
            </Txt>
            <Txt style={{ fontSize: 13.5, lineHeight: 20, color: '#aebfd6', marginTop: spacing[3] }}>
              70,000+ verified-remote roles · 150+ countries hiring.
            </Txt>
          </View>

          {/* White card sliding up from the bottom. */}
          <View
            style={{
              marginTop: 'auto',
              backgroundColor: colors.bgCard,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: spacing.authX,
              paddingTop: spacing[6],
              paddingBottom: insets.bottom + spacing[6],
            }}
          >
            <Segmented mode={mode} onChange={setMode} />

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
                <Pressable style={{ alignSelf: 'flex-end' }} onPress={() => router.push('/(auth)/forgot-password')}>
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

            {/* footer toggle + trust line */}
            <View style={{ marginTop: spacing[6], alignItems: 'center', gap: spacing[3] }}>
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
          </View>
        </ScrollView>
      </Wrap>

      <Dialog data={dialog} onClose={() => setDialog(null)} />
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
