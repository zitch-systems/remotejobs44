// src/app/(auth)/_layout.tsx — auth group; bounce to the app once signed in.
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';

export default function AuthLayout() {
  const { authed } = useAuth();
  if (authed) return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
