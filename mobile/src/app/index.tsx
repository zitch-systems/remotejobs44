// src/app/index.tsx — entry redirect based on auth state.
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

export default function Index() {
  const { authed, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgApp }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  return <Redirect href={authed ? '/(tabs)' : '/(auth)/sign-in'} />;
}
