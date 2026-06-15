// src/app/index.tsx — entry redirect based on auth state.
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { BrandLoaderScreen } from '@/components/BrandLoader';

export default function Index() {
  const { authed, loading } = useAuth();

  if (loading) return <BrandLoaderScreen label="Getting things ready…" />;
  return <Redirect href={authed ? '/(tabs)' : '/(auth)/sign-in'} />;
}
