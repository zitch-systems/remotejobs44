// src/app/(tabs)/_layout.tsx — bottom tab bar:
// Home · Jobs · Saved · Applied · Profile (five evenly-spaced tabs).
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, Tabs } from 'expo-router';
import { Bookmark, Briefcase, ClipboardList, House, User } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { usePushNotifications } from '@/lib/push';
import { fonts, useTheme } from '@/theme';

const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  index: House,
  jobs: Briefcase,
  saved: Bookmark,
  applications: ClipboardList,
  profile: User,
};
const LABELS: Record<string, string> = { index: 'Home', jobs: 'Jobs', saved: 'Saved', applications: 'Applied', profile: 'Profile' };

// Minimal shape of the props expo-router/react-navigation passes to tabBar.
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

function TabBar({ state, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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
          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              accessibilityRole="tab"
              accessibilityLabel={LABELS[route.name]}
              accessibilityState={{ selected: focused }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 }}
            >
              <Icon size={22} color={tint} />
              <Text style={{ fontFamily: fonts.displayMedium, fontSize: 10, color: tint }}>{LABELS[route.name]}</Text>
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
      <Tabs.Screen name="saved" />
      <Tabs.Screen name="applications" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
