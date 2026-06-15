// src/components/PaywallCard.tsx — a "Pro feature" gate card with an upgrade CTA
// (opens the Plans screen). Shown where a feature is plan-gated.
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { Button, Card, Txt } from './ui';
import { spacing, useTheme } from '@/theme';

export function PaywallCard({ title, subtitle, cta = 'Upgrade to Pro' }: { title: string; subtitle: string; cta?: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Card style={{ padding: spacing[5], gap: spacing[4], alignItems: 'center' }}>
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center' }}>
        <Sparkles size={24} color={colors.brand} />
      </View>
      <View style={{ alignItems: 'center', gap: 5 }}>
        <Txt variant="h2" center>
          {title}
        </Txt>
        <Txt variant="body" color={colors.fg3} center>
          {subtitle}
        </Txt>
      </View>
      <Button label={cta} onPress={() => router.push('/profile/plans')} />
    </Card>
  );
}
