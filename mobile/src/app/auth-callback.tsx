import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';
import { BrandLoaderScreen } from '@/components/BrandLoader';
import { Button, Txt } from '@/components/ui';
import { completeOAuthCallback } from '@/lib/oauth-callback';
import { spacing, useTheme } from '@/theme';

export default function AuthCallback() {
  const { colors } = useTheme();
  const router = useRouter();
  const liveUrl = Linking.useURL();
  const [initialUrl, setInitialUrl] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const callbackUrl = liveUrl ?? initialUrl;

  useEffect(() => {
    let active = true;
    Linking.getInitialURL()
      .then((url) => active && setInitialUrl(url))
      .catch(() => active && setInitialUrl(null));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const url = callbackUrl;
    if (!url) return;
    setError(null);
    let active = true;
    completeOAuthCallback(url).then((result) => {
      if (!active) return;
      if (result.status === 'success') router.replace('/(tabs)');
      else setError(result.message);
    });
    return () => { active = false; };
  }, [callbackUrl, router]);

  useEffect(() => {
    if (liveUrl || initialUrl !== null || error) return;
    const timer = setTimeout(() => setError('The sign-in callback is missing. Return to sign in and try again.'), 1500);
    return () => clearTimeout(timer);
  }, [error, initialUrl, liveUrl]);

  if (!error) return <BrandLoaderScreen label="Completing sign-in…" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgApp, alignItems: 'center', justifyContent: 'center', padding: spacing.authX, gap: spacing[4] }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(220,38,38,0.12)' }}>
        <ShieldAlert size={30} color={colors.danger} />
      </View>
      <Txt variant="h1" center>Sign-in failed</Txt>
      <Txt center color={colors.fg3} style={{ fontSize: 14, maxWidth: 320 }}>{error}</Txt>
      <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} style={{ width: '100%', marginTop: spacing[3] }} />
    </View>
  );
}
