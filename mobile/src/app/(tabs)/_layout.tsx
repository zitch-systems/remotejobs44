// src/app/(tabs)/_layout.tsx — bottom tab bar:
// Home · Search · Applied · Saved · Profile (five evenly-spaced tabs).
// Order + labels follow CLAUDE.md §4; the Applied tab carries a count badge
// when the user has applications.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, Tabs } from 'expo-router';
import { Bookmark, ClipboardList, House, Search, User } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { usePushNotifications } from '@/lib/push';
import { useAppStore } from '@/store/app';
import { fonts, useTheme } from '@/theme';

const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  index: House,
  jobs: Search,
  applications: ClipboardList,
  saved: Bookmark,
  profile: User,
};
const LABELS: Record<string, string> = { index: 'Home', jobs: 'Search', applications: 'Applied', saved: 'Saved', profile: 'Profile' };

// Minimal shape of the props expo-router/react-navigation passes to tabBar.
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

function TabBar({ state, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // §4: the Applied tab shows a count badge when applications exist.
  const appliedCount = useAppStore((s) => Object.keys(s.applied).length);
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.tabBar,
        borderTopWidth: 1,
        borderTopColor: colors.border1,
        paddingTop: 8,
        paddingBottom: Math.max(10, insets.bottom),
        paddingHorizontal: 6,
      }}
    >
      {state.routes
        .filter((r) => r.name in ICONS)
        .map((route) => {
          const idx = state.routes.findIndex((r) => r.key === route.key);
          const focused = state.index === idx;
          const Icon = ICONS[route.name];
          const tint = focused ? colors.brand : colors.fg4;
          const badge = route.name === 'applications' && appliedCount > 0 ? appliedCount : 0;
          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              accessibilityRole="tab"
              accessibilityLabel={badge ? `${LABELS[route.name]}, ${badge} applications` : LABELS[route.name]}
              accessibilityState={{ selected: focused }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 }}
            >
              <View>
                <Icon size={22} color={tint} />
                {badge ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -10,
                      minWidth: 16,
                      height: 16,
                      paddingHorizontal: 4,
                      borderRadius: 999,
                      backgroundColor: colors.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: colors.tabBar,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.displayExtrabold, fontSize: 9, color: '#fff' }}>{badge > 9 ? '9+' : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontFamily: fonts.displayMedium, fontSize: 11, color: tint }}>{LABELS[route.name]}</Text>
            </Pressable>
          );
        })}
    </View>
  );
}

export default function TabsLayout() {
  const { authed } = useAuth();
  // Registers for push + routes notification taps; no-ops until signed in.
  usePushNotifications();
  if (!authed) return <Redirect href="/(auth)/sign-in" />;
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...(props as unknown as TabBarProps)} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="jobs" />
      <Tabs.Screen name="applications" />
      <Tabs.Screen name="saved" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
