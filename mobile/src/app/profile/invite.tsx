// src/app/profile/invite.tsx — referral / invite screen. Share your code via
// the native sheet; track confirmed invites toward the Pro reward. The code +
// count come from lib/referrals (profiles.referral_code + the referrals table,
// migration_v40). Reward grants happen server-side; this screen shows progress.
import React from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Gift, Share2 } from 'lucide-react-native';
import { Button, Card, IconButton, Txt } from '@/components/ui';
import { BrandLoader } from '@/components/BrandLoader';
import { useReferral } from '@/lib/referrals';
import { referralLink, rewardProgress } from '@/lib/format';
import { fonts, spacing, useTheme } from '@/theme';

export default function Invite() {
  const { colors } = useTheme();
  const router = useRouter();
  const { state, goal, loading } = useReferral();
  const { remaining, pct, reached } = rewardProgress(state.count, goal);

  const link = referralLink(state.code);
  const share = () => {
    Share.share({
      message: `I'm using RemoteJobs44 to find verified remote jobs that pay in ₦ or $. Sign up with my link and we both get a perk: ${link}`,
    }).catch(() => {});
  };

  const Step = ({ n, title, desc }: { n: number; title: string; desc: string }) => (
    <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}>
      <View style={{ width: 24, height: 24, borderRadius: 999, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center' }}>
        <Txt style={{ fontFamily: fonts.displayBold, fontSize: 12, color: colors.brand }}>{n}</Txt>
      </View>
      <View style={{ flex: 1 }}>
        <Txt style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.fg1 }}>{title}</Txt>
        <Txt variant="meta" color={colors.fg3} style={{ marginTop: 2 }}>
          {desc}
        </Txt>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing.screenX, paddingTop: spacing[2] }}>
        <IconButton accessibilityLabel="Go back" onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2">Invite friends</Txt>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <BrandLoader label="Loading your code" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[5], paddingBottom: spacing[10], gap: spacing[4] }}
        >
          {/* hero — code + share */}
          <Card style={{ padding: spacing[5], gap: spacing[4], alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center' }}>
              <Gift size={24} color={colors.brand} />
            </View>
            <View style={{ alignItems: 'center', gap: 5 }}>
              <Txt variant="h2" center>
                Give friends a head start
              </Txt>
              <Txt variant="body" color={colors.fg3} center>
                Share your code. When {goal} friends sign up, you get 1 month of Pro — free.
              </Txt>
            </View>

            <Pressable
              onPress={share}
              accessibilityRole="button"
              accessibilityLabel={`Share your invite code ${state.code}`}
              style={({ pressed }) => [
                {
                  alignSelf: 'stretch',
                  alignItems: 'center',
                  gap: 3,
                  paddingVertical: spacing[3],
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: colors.border2,
                  backgroundColor: colors.bgSection,
                },
                pressed && { transform: [{ scale: 0.99 }] },
              ]}
            >
              <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 22, letterSpacing: 2, color: colors.fg1 }}>{state.code}</Txt>
              <Txt variant="meta" color={colors.fg4}>
                Tap to share
              </Txt>
            </Pressable>

            <Button label="Share invite" icon={<Share2 size={18} color="#fff" />} onPress={share} />
          </Card>

          {/* progress */}
          <Card style={{ padding: spacing[4], gap: spacing[3] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt variant="h3" color={colors.fg1}>
                Your invites
              </Txt>
              <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: 15, color: reached ? colors.success : colors.brand }}>
                {state.count}/{goal}
              </Txt>
            </View>
            <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.bgSection, overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: '100%', borderRadius: 999, backgroundColor: reached ? colors.success : colors.brand }} />
            </View>
            <Txt variant="meta" color={colors.fg3}>
              {reached
                ? 'Reward unlocked — enjoy your month of Pro!'
                : `Invite ${remaining} more friend${remaining === 1 ? '' : 's'} to unlock 1 month of Pro.`}
            </Txt>
          </Card>

          {/* how it works */}
          <Card style={{ padding: spacing[4], gap: spacing[4] }}>
            <Txt variant="eyebrow" color={colors.fg3}>
              How it works
            </Txt>
            <Step n={1} title="Share your code" desc="Send your link to friends looking for remote work." />
            <Step n={2} title="They sign up" desc="Your code is applied automatically when they join." />
            <Step n={3} title="You both win" desc={`Reach ${goal} sign-ups and get a month of Pro, free.`} />
          </Card>

          <Txt variant="meta" color={colors.fg4} style={{ paddingHorizontal: spacing[2] }}>
            Rewards are applied automatically once a friend signs up with your link and completes their profile. Pro is billed and managed on the web.
          </Txt>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
