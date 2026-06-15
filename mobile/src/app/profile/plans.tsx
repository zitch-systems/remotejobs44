// src/app/profile/plans.tsx — plans + upgrade entry point. Payment runs on the
// web (Paystack), so "Upgrade" opens the web pricing/billing in the browser.
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, Check } from 'lucide-react-native';
import { Button, Card, IconButton, Pill, Txt } from '@/components/ui';
import { useProfile } from '@/lib/profile';
import { fonts, radii, spacing, useTheme } from '@/theme';

const TIERS = [
  { id: 'free', name: 'Free', price: '₦0', period: '', features: ['Browse 70,000+ jobs', 'Save favourites'] },
  { id: 'daily', name: 'Day Pass', price: '₦500', period: '/24h', features: ['Full access for 24 hours', '10 applications'] },
  { id: 'pro', name: 'Pro Monthly', price: '₦2,999', period: '/mo', features: ['Unlimited applications', 'Job alerts', 'AI CV review + interview prep'], recommended: true },
  { id: 'annual', name: 'Pro Annual', price: '₦29,999', period: '/yr', features: ['Everything in Pro', 'Save ₦5,989 a year'] },
] as const;

const PLAN_LABEL: Record<string, string> = { free: 'Free', daily: 'Day Pass', pro: 'Pro', admin: 'Admin' };

export default function Plans() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile } = useProfile();
  const isPaid = profile.plan === 'pro' || profile.plan === 'daily' || profile.plan === 'admin';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing.screenX, paddingTop: spacing[2] }}>
        <IconButton accessibilityLabel="Go back" onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2">Plans</Txt>
      </View>

      <View style={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[5], gap: spacing[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Txt color={colors.fg3}>Current plan</Txt>
          <Pill label={PLAN_LABEL[profile.plan] ?? 'Free'} bg={colors.infoBg} fg={colors.infoText} border={colors.infoBorder} />
        </View>

        {TIERS.map((t) => {
          const current = t.id === profile.plan || (profile.plan === 'pro' && t.id === 'pro');
          const rec = 'recommended' in t && t.recommended;
          return (
            <Card key={t.id} style={{ padding: spacing[4], gap: spacing[3], borderColor: rec ? colors.brand : colors.border1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Txt variant="h3" color={colors.fg1}>
                    {t.name}
                  </Txt>
                  {rec ? <Pill label="Popular" bg={colors.brand} fg="#fff" small /> : null}
                </View>
                {current ? <Pill label="Current" bg={colors.successBg} fg={colors.successText} border={colors.successBorder} small /> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 22, color: colors.fg1 }}>{t.price}</Txt>
                <Txt variant="meta" color={colors.fg4}>
                  {t.period}
                </Txt>
              </View>
              <View style={{ gap: spacing[2] }}>
                {t.features.map((f) => (
                  <View key={f} style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}>
                    <Check size={15} color={colors.success} />
                    <Txt color={colors.fg2} style={{ fontSize: 13 }}>
                      {f}
                    </Txt>
                  </View>
                ))}
              </View>
            </Card>
          );
        })}

        <Button
          label={isPaid ? 'Manage billing' : 'Upgrade on the web'}
          onPress={() => WebBrowser.openBrowserAsync(isPaid ? 'https://remotejobs44.com/settings' : 'https://remotejobs44.com/pricing')}
        />
        <Txt variant="meta" color={colors.fg4} style={{ paddingHorizontal: spacing[2] }}>
          Payments are processed securely on the web via Paystack.
        </Txt>
      </View>
    </SafeAreaView>
  );
}
