// src/app/index.tsx — entry redirect: onboarding (first run) → auth → app.
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { BrandLoaderScreen } from '@/components/BrandLoader';
import { usePrefs } from '@/store/prefs';

export default function Index() {
  const { authed, loading } = useAuth();
  const hydrated = usePrefs((s) => s.hydrated);
  const onboarded = usePrefs((s) => s.onboarded);

  // Wait for both auth + the persisted prefs to settle before routing.
  if (loading || !hydrated) return <BrandLoaderScreen label="Getting things ready…" />;
  if (!onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href={authed ? '/(tabs)' : '/(auth)/sign-in'} />;
}

