// src/components/BrandLoader.tsx — branded loading animation.
// The RemoteJobs44 logo mark (blue gradient tile + white chart-line + orange
// dot) gently pulses inside a spinning brand-blue arc. Used wherever items are
// loading. All animation is transform-based (useNativeDriver) so it's smooth.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { palette, useTheme } from '@/theme';
import { Txt } from './ui';

export function BrandLoader({ size = 60, label }: { size?: number; label?: string }) {
  const { colors } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [spin, pulse]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  const ring = size;
  const tile = Math.round(size * 0.6);
  const r = (ring - 3) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <View style={{ alignItems: 'center', gap: 14 }}>
      <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
        {/* spinning brand arc */}
        <Animated.View style={{ position: 'absolute', transform: [{ rotate }] }}>
          <Svg width={ring} height={ring}>
            <Circle cx={ring / 2} cy={ring / 2} r={r} stroke={colors.border1} strokeWidth={3} fill="none" />
            <Circle
              cx={ring / 2}
              cy={ring / 2}
              r={r}
              stroke={palette.brand600}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circ * 0.3} ${circ}`}
            />
          </Svg>
        </Animated.View>

        {/* pulsing logo tile */}
        <Animated.View style={{ width: tile, height: tile, transform: [{ scale }] }}>
          <Svg width={tile} height={tile} viewBox="0 0 40 40">
            <Defs>
              <LinearGradient id="brandLoader" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={palette.brand600} />
                <Stop offset="1" stopColor={palette.brand700} />
              </LinearGradient>
            </Defs>
            <Rect width="40" height="40" rx="11" fill="url(#brandLoader)" />
            <Path d="M8 27 Q15 11 21 20 Q26 27 31 13" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
            <Circle cx="31" cy="13" r="3.4" fill={palette.accent} />
          </Svg>
        </Animated.View>
      </View>

      {label ? (
        <Txt variant="meta" color={colors.fg3}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

/** Full-screen centered brand loader (for whole-screen loading states). */
export function BrandLoaderScreen({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgApp }}>
      <BrandLoader label={label} />
    </View>
  );
}
