// src/lib/push.ts — push-notification registration + tap routing (job alerts).
//
// Client side only: request permission, get the Expo push token, persist it to
// `device_push_tokens` (see supabase/migration_v37_device_push_tokens.sql), and
// route to the job when a notification is tapped. The SENDER (a server / edge
// function that queries new matching jobs and calls Expo's push API) is the
// remaining backend piece — see mobile/README.md.
//
// Note: remote push needs a Dev Client / production build (not Expo Go) and an
// EAS projectId (extra.eas.projectId, written by `eas init`). All paths here
// fail soft, so the app is unaffected when those aren't present.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { isSupabaseConfigured, supabase } from './supabase';
import { useAppStore } from '@/store/app';
import { usePrefs } from '@/store/prefs';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushToken(): Promise<string | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null; // native only
  if (!Device.isDevice) return null; // simulators can't receive a push token

  const existing = await Notifications.getPermissionsAsync();
  const status = existing.granted ? 'granted' : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Job alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return null; // Expo push tokens require an EAS project

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    return null; // e.g. Expo Go (remote push unsupported)
  }
}

async function persistToken(userId: string, token: string): Promise<void> {
  await supabase
    .from('device_push_tokens')
    .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'token' });
}

/**
 * Remove the signed-out user's push tokens so a shared device doesn't keep
 * delivering their job alerts to whoever signs in next. Best-effort.
 */
export async function clearPushTokens(userId: string): Promise<void> {
  if (!isSupabaseConfigured || !userId) return;
  try {
    await supabase.from('device_push_tokens').delete().eq('user_id', userId);
  } catch {
    /* best-effort */
  }
}

/** Registers the device for push when signed in, and routes taps to the job. */
export function usePushNotifications(): void {
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const alertsMatches = usePrefs((s) => s.alertsMatches);

  useEffect(() => {
    // Only register a push token when signed in AND the user wants match alerts.
    if (!isSupabaseConfigured || !userId || !alertsMatches) return;
    let active = true;
    registerForPushToken()
      .then((token) => {
        if (active && token) persistToken(userId, token).catch(() => {});
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId, alertsMatches]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const jobId = response.notification.request.content.data?.jobId;
      if (typeof jobId === 'string') router.push({ pathname: '/job/[id]', params: { id: jobId } });
    });
    return () => sub.remove();
  }, [router]);
}
