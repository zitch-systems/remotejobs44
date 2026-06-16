// src/app/_layout.tsx — root layout: fonts, providers, navigation stack.
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { AuthProvider } from '@/lib/auth';
import { initSentry, withSentry } from '@/lib/sentry';
import { Toaster } from '@/components/Toaster';

SplashScreen.preventAutoHideAsync().catch(() => {});
initSentry();

function RootLayout() {
  const [loaded] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="job/[id]" options={{ presentation: 'card' }} />
          </Stack>
          <Toaster />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Wrapped for Sentry routing/error instrumentation (no-op without a DSN).
export default withSentry(RootLayout);

/**
 * Expo Router's root error boundary — catches render errors anywhere in the
 * navigation tree and turns a hard native crash ("the app just closed") into a
 * recoverable screen that SHOWS the actual error. Deliberately self-contained:
 * it renders ABOVE the providers (theme / safe-area / auth), one of which may be
 * what failed, so it uses only inline styles and the system font. The secondary
 * action clears AsyncStorage to escape a crash loop caused by a corrupt
 * persisted session.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={eb.root}>
      <View style={eb.card}>
        <Text style={eb.badge}>!</Text>
        <Text style={eb.title}>Something went wrong</Text>
        <Text style={eb.sub}>
          The app hit an unexpected error. Try again — and if it keeps happening, reset local data to clear a stale session.
        </Text>
        <ScrollView style={eb.box} contentContainerStyle={{ padding: 12 }}>
          <Text style={eb.mono}>{error?.message || 'Unknown error'}</Text>
        </ScrollView>
        <Pressable style={[eb.btn, eb.btnPrimary]} onPress={() => retry()}>
          <Text style={eb.btnPrimaryText}>Try again</Text>
        </Pressable>
        <Pressable
          style={eb.btn}
          onPress={async () => {
            try {
              await AsyncStorage.clear();
            } catch {
              /* ignore — best-effort reset */
            }
            retry();
          }}
        >
          <Text style={eb.btnText}>Reset app data &amp; retry</Text>
        </Pressable>
      </View>
    </View>
  );
}

const eb = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 80 },
  card: { width: '100%', maxWidth: 420, backgroundColor: '#111c35', borderRadius: 18, borderWidth: 1, borderColor: '#1e2d4a', padding: 22, gap: 12 },
  badge: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#2563eb', color: '#fff', textAlign: 'center', lineHeight: 36, fontSize: 22, fontWeight: '800' },
  title: { color: '#e2e8f4', fontSize: 21, fontWeight: '800' },
  sub: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
  box: { maxHeight: 160, backgroundColor: '#0a1628', borderRadius: 12, borderWidth: 1, borderColor: '#1e2d4a' },
  mono: { color: '#fca5a5', fontSize: 12.5, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  btn: { height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1e3a5f' },
  btnPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnText: { color: '#cbd5e1', fontSize: 15, fontWeight: '600' },
});
