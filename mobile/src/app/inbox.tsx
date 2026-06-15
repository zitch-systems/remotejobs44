// src/app/inbox.tsx — notification inbox. Reads store/notifications (kept in
// sync with the Home bell badge). Tap a notification to mark it read and open
// the related job. Separate from Profile → Notifications (which is preferences).
import React, { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bell, ClipboardList, Info, Sparkles } from 'lucide-react-native';
import { IconButton, Txt } from '@/components/ui';
import { BrandLoader } from '@/components/BrandLoader';
import { useAppStore } from '@/store/app';
import { useNotifications } from '@/store/notifications';
import { timeAgo } from '@/lib/format';
import type { AppNotification } from '@/lib/notifications';
import { fonts, radii, spacing, useTheme } from '@/theme';

export default function Inbox() {
  const { colors } = useTheme();
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const items = useNotifications((s) => s.items);
  const loading = useNotifications((s) => s.loading);
  const load = useNotifications((s) => s.load);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const [now] = useState(() => Date.now());
  const unread = items.reduce((n, x) => n + (x.read ? 0 : 1), 0);

  useEffect(() => {
    load(userId);
  }, [userId, load]);

  const iconFor = (t: AppNotification['type']) => {
    if (t === 'job_alert') return <Sparkles size={16} color={colors.brand} />;
    if (t === 'application') return <ClipboardList size={16} color={colors.success} />;
    return <Info size={16} color={colors.fg3} />;
  };

  const onPress = (n: AppNotification) => {
    if (!n.read) markRead(userId, n.id);
    if (n.jobId) router.push({ pathname: '/job/[id]', params: { id: n.jobId } });
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing.screenX, paddingTop: spacing[2] }}>
        <IconButton accessibilityLabel="Go back" onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2" style={{ flex: 1 }}>
          Notifications
        </Txt>
        {unread > 0 ? (
          <Pressable onPress={() => markAllRead(userId)} accessibilityRole="button" accessibilityLabel="Mark all read" hitSlop={8}>
            <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 13, color: colors.brand }}>Mark all read</Txt>
          </Pressable>
        ) : null}
      </View>

      {loading && items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <BrandLoader label="Loading notifications…" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[4], paddingBottom: spacing[10], gap: spacing[2] }}
          refreshControl={<RefreshControl refreshing={loading && items.length > 0} onRefresh={() => load(userId)} tintColor={colors.brand} />}
        >
          {items.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing[16], gap: spacing[3] }}>
              <View style={{ width: 60, height: 60, borderRadius: radii.lg, backgroundColor: colors.bgSection, alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={26} color={colors.fg4} />
              </View>
              <Txt variant="h3" color={colors.fg1}>
                No notifications yet
              </Txt>
              <Txt center color={colors.fg3} style={{ maxWidth: 260 }}>
                Job alerts and application updates will show up here.
              </Txt>
            </View>
          ) : (
            items.map((n) => (
              <Pressable
                key={n.id}
                onPress={() => onPress(n)}
                accessibilityRole="button"
                accessibilityLabel={`${n.title}${n.read ? '' : ', unread'}`}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    gap: spacing[3],
                    padding: spacing[3],
                    borderRadius: radii.row,
                    backgroundColor: n.read ? colors.bgCard : colors.infoBg,
                    borderWidth: 1.5,
                    borderColor: n.read ? colors.border1 : colors.infoBorder,
                  },
                  pressed && { transform: [{ scale: 0.99 }] },
                ]}
              >
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.bgSection, alignItems: 'center', justifyContent: 'center' }}>
                  {iconFor(n.type)}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="cardTitle" color={colors.fg1} numberOfLines={1}>
                    {n.title}
                  </Txt>
                  {n.body ? (
                    <Txt variant="meta" color={colors.fg3} numberOfLines={2}>
                      {n.body}
                    </Txt>
                  ) : null}
                  <Txt variant="meta" color={colors.fg4} style={{ marginTop: 1 }}>
                    {timeAgo(n.createdAt, now)}
                  </Txt>
                </View>
                {!n.read ? <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.accent, marginTop: 4 }} /> : null}
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
