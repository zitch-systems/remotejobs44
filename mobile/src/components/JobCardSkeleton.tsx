// src/components/JobCardSkeleton.tsx — loading placeholder that mirrors a
// JobCard's silhouette. Shown while the feed's first page (or a filter change)
// is loading, instead of a single centered spinner, so the screen feels fast
// and the layout doesn't jump.
import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { Card } from './ui';
import { radii, spacing, useTheme } from '@/theme';

function Block({ w, h, r = 6, o }: { w: number | string; h: number; r?: number; o: Animated.Value }) {
  const { colors } = useTheme();
  return <Animated.View style={{ width: w as number, height: h, borderRadius: r, backgroundColor: colors.bgSection, opacity: o }} />;
}

export function JobCardSkeleton() {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Card style={{ padding: spacing[4], gap: spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Animated.View style={{ width: 44, height: 44, borderRadius: radii.logo, backgroundColor: colors.bgSection, opacity: pulse }} />
        <View style={{ flex: 1, gap: 8 }}>
          <Block w={'70%'} h={14} o={pulse} />
          <Block w={'45%'} h={11} o={pulse} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <Block w={64} h={22} r={11} o={pulse} />
        <Block w={84} h={22} r={11} o={pulse} />
        <Block w={56} h={22} r={11} o={pulse} />
      </View>
    </Card>
  );
}

/** A short stack of skeletons for an initial/refetch loading state. */
export function JobListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={{ gap: spacing[3] }}>
      {Array.from({ length: count }).map((_, i) => (
        <JobCardSkeleton key={i} />
      ))}
    </View>
  );
}
