// src/components/MatchRing.tsx — circular match-score ring.
// RN has no conic-gradient, so we draw an SVG track + progress arc
// (strokeDasharray), rotated so it starts at 12 o'clock.
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { fonts, useTheme } from '@/theme';
import { Txt } from './ui';

export function MatchRing({ pct, size = 78, stroke = 7 }: { pct: number; size?: number; stroke?: number }) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - clamped / 100);
  const center = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={center} cy={center} r={r} stroke={colors.border1} strokeWidth={stroke} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={colors.success}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <Txt style={{ fontFamily: fonts.displayExtrabold, fontSize: size * 0.26, lineHeight: size * 0.3, color: colors.fg1 }}>{`${clamped}%`}</Txt>
    </View>
  );
}
