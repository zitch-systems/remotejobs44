// RemoteJobs44 — navigation root. Onboarding → auth gate → bottom tabs + stack screens.
import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/store';
import { Icon } from './src/ui';
import {
  AuthScreen, FeedScreen, SearchScreen, DetailScreen,
  ApplicationsScreen, SavedScreen, ProfileScreen,
} from './src/screens';
import {
  OnboardingScreen, InboxScreen, EditProfileScreen, PreferencesScreen, InviteScreen,
} from './src/extra';
import {
  PlansScreen, SettingsScreen, AIToolsScreen, AIToolScreen, ForgotScreen,
} from './src/pro';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TABS: Record<string, string> = { Home: 'home', Search: 'search', Applied: 'brief', Saved: 'bookmark', Profile: 'user' };

function Tabs() {
  const { theme } = useStore();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.brand600,
        tabBarInactiveTintColor: theme.fg4,
        tabBarStyle: { backgroundColor: theme.bgElev, borderTopColor: theme.line, height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
        tabBarIcon: ({ color }) => <Icon name={TABS[route.name]} size={23} color={color} />,
      })}
    >
      <Tab.Screen name="Home" component={FeedScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Applied" component={ApplicationsScreen} />
      <Tab.Screen name="Saved" component={SavedScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const { state, theme } = useStore();
  const navTheme = theme.mode === 'dark'
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: theme.bg, card: theme.bgElev } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: theme.bg, card: theme.bgElev } };
  const slide = { animation: 'slide_from_right' as const };
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!state.seenOnboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : !state.user ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="Detail" component={DetailScreen} options={slide} />
            <Stack.Screen name="Inbox" component={InboxScreen} options={slide} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} options={slide} />
            <Stack.Screen name="Preferences" component={PreferencesScreen} options={slide} />
            <Stack.Screen name="Invite" component={InviteScreen} options={slide} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={slide} />
            <Stack.Screen name="AITools" component={AIToolsScreen} options={slide} />
            <Stack.Screen name="AITool" component={AIToolScreen} options={slide} />
            <Stack.Screen name="Forgot" component={ForgotScreen} options={slide} />
            <Stack.Screen name="Plans" component={PlansScreen} options={{ presentation: 'modal' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Root />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
