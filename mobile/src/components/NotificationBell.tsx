// src/components/NotificationBell.tsx — Home header bell + unread badge.
// Loads the inbox on sign-in and opens it on tap (store/notifications keeps the
// badge and the inbox screen in sync).
import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { Txt } from './ui';
import { useAppStore } from '@/store/app';
import { useNotifications } from '@/store/notifications';
import { fonts, useTheme } from '@/theme';

export function NotificationBell() {
  const { colors } = useTheme();
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const load = useNotifications((s) => s.load);
  const unread = useNotifications((s) => s.items.reduce((n, x) => n + (x.read ? 0 : 1), 0));

  useEffect(() => {
    load(userId);
  }, [userId, load]);

  return (
    <Pressable
      onPress={() => router.push('/inbox')}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: 38,
          height: 38,
          borderRadius: 11,
          backgroundColor: colors.bgCard,
          borderWidth: 1.5,
          borderColor: colors.border2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <Bell size={18} color={colors.fg2} />
      {unread > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -5,
            right: -5,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 999,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.bgApp,
          }}
        >
          <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 10, color: '#fff' }}>{unread > 9 ? '9+' : unread}</Txt>
        </View>
      ) : null}
    </Pressable>
  );
}
