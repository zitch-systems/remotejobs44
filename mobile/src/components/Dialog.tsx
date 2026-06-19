// src/components/Dialog.tsx — a small, on-brand alert dialog used in place of the
// OS `Alert.alert`. Centered card, tone-coloured icon, single dismiss action.
// Tap the backdrop or the button to close.
import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react-native';
import { Txt } from './ui';
import { fonts, radii, shadows, spacing, useTheme } from '@/theme';

export type DialogTone = 'error' | 'success' | 'info';

export interface DialogData {
  title: string;
  message: string;
  tone?: DialogTone;
  cta?: string;
}

export function Dialog({ data, onClose }: { data: DialogData | null; onClose: () => void }) {
  const { colors } = useTheme();
  const tone = data?.tone ?? 'error';
  const accent = tone === 'error' ? colors.danger : tone === 'success' ? colors.success : colors.brand;
  const tintBg = tone === 'error' ? 'rgba(220,38,38,0.12)' : tone === 'success' ? colors.successBg : colors.infoBg;
  const Icon = tone === 'error' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info;

  return (
    <Modal visible={!!data} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing[6] }}
      >
        {/* swallow taps inside the card so they don't dismiss */}
        <Pressable
          onPress={() => {}}
          style={[
            { width: '100%', maxWidth: 360, backgroundColor: colors.bgCard, borderRadius: radii.xl, padding: spacing[5], gap: spacing[3], alignItems: 'center' },
            shadows.card,
          ]}
        >
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: tintBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={26} color={accent} strokeWidth={2.2} />
          </View>
          <Txt variant="h3" center color={colors.fg1}>
            {data?.title}
          </Txt>
          <Txt center color={colors.fg3} style={{ fontSize: 14, lineHeight: 20 }}>
            {data?.message}
          </Txt>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [
              {
                marginTop: spacing[2],
                alignSelf: 'stretch',
                height: 48,
                borderRadius: radii.field,
                backgroundColor: accent,
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Txt style={{ fontFamily: fonts.displayBold, fontSize: 15, color: '#fff' }}>{data?.cta ?? 'Got it'}</Txt>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
