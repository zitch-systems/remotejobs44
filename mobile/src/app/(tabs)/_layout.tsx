// src/app/(tabs)/_layout.tsx — bottom tab bar (Home · Applications · Profile)
// with a raised center FAB (the quick-match affordance from the handoff).
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { ClipboardList, House, User, Zap } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { fonts, shadows, useTheme } from '@/theme';

const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  index: House,
  applications: ClipboardList,
  profile: User,
};
const LABELS: Record<string, string> = { index: 'Home', applications: 'Applied', profile: 'Profile' };

// Minimal shape of the props expo-router/react-navigation passes to tabBar.
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

function TabBar({ state, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.tabBar,
        borderTopWidth: 1,
        borderTopColor: colors.border1,
        paddingTop: 8,
        paddingBottom: Math.max(10, insets.bottom),
        paddingHorizontal: 12,
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
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 }}
            >
              <Icon size={22} color={tint} />
              <View style={{ height: 12 }}>
                <Text style={{ fontFamily: fonts.displayMedium, fontSize: 10, color: tint }}>{LABELS[route.name]}</Text>
              </View>
            </Pressable>
          );
        })}

      {/* Raised center FAB — quick jump to matches. */}
      <Pressable
        accessibilityLabel="Quick match"
        onPress={() => router.push('/(tabs)')}
        style={({ pressed }) => [
          {
            position: 'absolute',
            top: -22,
            alignSelf: 'center',
            width: 54,
            height: 54,
            borderRadius: 18,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          },
          shadows.accent,
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        <Zap size={24} color="#fff" fill="#fff" />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const { authed } = useAuth();
  if (!authed) return <Redirect href="/(auth)/sign-in" />;
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...(props as unknown as TabBarProps)} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="applications" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
