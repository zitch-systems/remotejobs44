// src/app/profile/plans.tsx — plans + in-app subscription checkout.
//
// Tapping a paid plan starts an in-app Paystack checkout (lib/paystack.ts) and,
// on success, upgrades the plan and refreshes the screen. If payments aren't
// configured server-side yet (no PAYSTACK_SECRET_KEY / functions undeployed),
// it falls back to the web pricing page so nothing regresses.
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, Check, ShieldCheck, Sparkles } from 'lucide-react-native';
import { Card, IconButton, Pill, Txt } from '@/components/ui';
import { useProfile } from '@/lib/profile';
import { isPaid } from '@/lib/entitlements';
import { PaymentsNotConfiguredError, startSubscription, type PaystackPlan } from '@/lib/paystack';
import { toast } from '@/store/toast';
import { fonts, radii, shadows, spacing, useTheme } from '@/theme';

type TierId = 'free' | 'daily' | 'pro' | 'annual';

const TIERS: {
  id: TierId;
  name: string;
  price: string;
  period: string;
  features: string[];
  recommended?: boolean;
}[] = [
  { id: 'free', name: 'Free', price: '₦0', period: '', features: ['Browse 70,000+ verified jobs', 'Save favourites', '10 applications / day'] },
  { id: 'daily', name: 'Day Pass', price: '₦500', period: '/ 24h', features: ['Full access for 24 hours', 'Unlimited applications for a day'] },
  {
    id: 'pro',
    name: 'Pro Monthly',
    price: '₦2,999',
    period: '/ month',
    features: ['Unlimited applications', 'Job alerts', 'AI CV review + interview prep'],
    recommended: true,
  },
  { id: 'annual', name: 'Pro Annual', price: '₦29,999', period: '/ year', features: ['Everything in Pro', 'Save ₦5,989 a year'] },
];

const PLAN_LABEL: Record<string, string> = { free: 'Free', daily: 'Day Pass', pro: 'Pro', admin: 'Admin' };
const WEB_PRICING = 'https://remotejobs44.com/pricing';
const WEB_BILLING = 'https://remotejobs44.com/settings';

export default function Plans() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile, reload } = useProfile();
  const paid = isPaid(profile.plan);
  const [busy, setBusy] = useState<TierId | null>(null);

  async function choose(tier: TierId) {
    if (tier === 'free' || busy) return;
    setBusy(tier);
    try {
      const result = await startSubscription(tier as PaystackPlan);
      if (result.status === 'success') {
        reload();
        const msg = result.plan === 'daily' ? "Day Pass active — you're all set for 24h! 🎉" : "You're all set — welcome to Pro! 🎉";
        toast(msg, 'success');
      }
      // 'cancelled' → stay quiet.
    } catch (e) {
      if (e instanceof PaymentsNotConfiguredError) {
        // Server-side payments not wired yet → use the web checkout.
        await WebBrowser.openBrowserAsync(WEB_PRICING);
      } else {
        toast((e as Error)?.message ?? 'Could not start checkout.', 'error');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing.screenX, paddingTop: spacing[2] }}>
        <IconButton accessibilityLabel="Go back" onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2">Plans</Txt>
        <View style={{ flex: 1 }} />
        <Pill label={PLAN_LABEL[profile.plan] ?? 'Free'} bg={colors.infoBg} fg={colors.infoText} border={colors.infoBorder} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[5], paddingBottom: spacing[12], gap: spacing[4] }}
      >
        {/* hero */}
        <View style={{ gap: 6 }}>
          <Txt variant="h1">Unlock the full job hunt</Txt>
          <Txt color={colors.fg3} style={{ fontSize: 14, lineHeight: 20 }}>
            Apply without limits, get job alerts, and use AI to sharpen your CV and ace interviews.
          </Txt>
        </View>

        {TIERS.map((t) => {
          const current = t.id === profile.plan || (profile.plan === 'pro' && t.id === 'annual');
          const rec = Boolean(t.recommended);
          const loading = busy === t.id;
          return (
            <Card
              key={t.id}
              style={{
                padding: spacing[4],
                gap: spacing[3],
                borderColor: rec ? colors.brand : colors.border1,
                borderWidth: rec ? 2 : 1.5,
                ...(rec ? shadows.field : null),
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Txt variant="h3" color={colors.fg1}>
                    {t.name}
                  </Txt>
                  {rec ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
                      <Sparkles size={11} color="#fff" />
                      <Txt style={{ fontFamily: fonts.displayBold, fontSize: 10.5, color: '#fff' }}>Popular</Txt>
                    </View>
                  ) : null}
                </View>
                {current ? <Pill label="Current" bg={colors.successBg} fg={colors.successText} border={colors.successBorder} small /> : null}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 26, color: colors.fg1 }}>{t.price}</Txt>
                <Txt variant="meta" color={colors.fg4}>
                  {t.period}
                </Txt>
              </View>

              <View style={{ gap: spacing[2] }}>
                {t.features.map((f) => (
                  <View key={f} style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' }}>
                    <Check size={15} color={colors.success} style={{ marginTop: 2 }} />
                    <Txt color={colors.fg2} style={{ flex: 1, fontSize: 13, lineHeight: 19 }}>
                      {f}
                    </Txt>
                  </View>
                ))}
              </View>

              {t.id !== 'free' && !current ? (
                <Pressable
                  onPress={() => choose(t.id)}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${t.name}`}
                  style={({ pressed }) => [
                    {
                      height: 48,
                      borderRadius: radii.field,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: spacing[2],
                      marginTop: spacing[1],
                      backgroundColor: rec ? colors.brand : colors.bgSection,
                      borderWidth: rec ? 0 : 1.5,
                      borderColor: colors.border2,
                    },
                    rec ? shadows.primary : null,
                    pressed && !loading && { transform: [{ scale: 0.98 }] },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color={rec ? '#fff' : colors.fg2} />
                  ) : (
                    <Txt style={{ fontFamily: fonts.displayBold, fontSize: 14, color: rec ? '#fff' : colors.fg1 }}>
                      {`Choose ${t.name}`}
                    </Txt>
                  )}
                </Pressable>
              ) : null}
            </Card>
          );
        })}

        {paid ? (
          <Pressable onPress={() => WebBrowser.openBrowserAsync(WEB_BILLING)} style={{ alignSelf: 'center', paddingVertical: spacing[2] }}>
            <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 13, color: colors.brand }}>Manage billing</Txt>
          </Pressable>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing[1] }}>
          <ShieldCheck size={13} color={colors.success} />
          <Txt variant="meta" color={colors.fg4}>
            Secure payment via Paystack · cancel anytime
          </Txt>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
