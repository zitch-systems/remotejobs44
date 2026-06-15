// src/app/onboarding.tsx — first-run intro (3 slides). Shown once, gated by the
// persisted `onboarded` flag (store/prefs); the entry redirect routes here.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRight, BellRing, Globe2, Sparkles, type LucideIcon } from 'lucide-react-native';
import { Button, Txt } from '@/components/ui';
import { usePrefs } from '@/store/prefs';
import { palette, spacing, useTheme } from '@/theme';

const SLIDES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Globe2, title: '70,000+ remote jobs', body: 'Fully-remote roles from global companies, vetted for talent across Africa.' },
  { icon: Sparkles, title: 'Matches that fit you', body: 'See how well each role matches your skills — then apply in one tap.' },
  { icon: BellRing, title: 'Never miss a role', body: 'Save jobs, track applications, and get alerted when new matches land.' },
];

export default function Onboarding() {
  const { colors } = useTheme();
  const router = useRouter();
  const setOnboarded = usePrefs((s) => s.setOnboarded);
  const [step, setStep] = useState(0);

  const slide = SLIDES[step];
  const Icon = slide.icon;
  const last = step === SLIDES.length - 1;

  function finish() {
    setOnboarded(true);
    router.replace('/');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flex: 1, paddingHorizontal: spacing.authX, paddingTop: spacing[4] }}>
        {/* top: wordmark + skip */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt style={{ fontSize: 15 }} variant="h2">
            RemoteJobs<Txt variant="h2" color={palette.accent} style={{ fontSize: 15 }}>44</Txt>
          </Txt>
          {!last ? (
            <Pressable onPress={finish} hitSlop={8}>
              <Txt variant="meta" color={colors.fg3}>
                Skip
              </Txt>
            </Pressable>
          ) : null}
        </View>

        {/* slide */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[5] }}>
          <View
            style={{
              width: 104,
              height: 104,
              borderRadius: 32,
              backgroundColor: colors.infoBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={44} color={colors.brand} strokeWidth={1.8} />
          </View>
          <View style={{ gap: spacing[3], alignItems: 'center' }}>
            <Txt variant="h1" center>
              {slide.title}
            </Txt>
            <Txt center color={colors.fg3} style={{ fontSize: 14.5, lineHeight: 22, maxWidth: 300 }}>
              {slide.body}
            </Txt>
          </View>
        </View>

        {/* dots + CTA */}
        <View style={{ paddingBottom: spacing[5], gap: spacing[5] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === step ? 22 : 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: i === step ? colors.brand : colors.border2,
                }}
              />
            ))}
          </View>
          <Button
            label={last ? 'Get started' : 'Next'}
            onPress={() => (last ? finish() : setStep((s) => s + 1))}
            icon={<ArrowRight size={18} color="#fff" />}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
