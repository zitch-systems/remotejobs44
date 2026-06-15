// src/components/Toaster.tsx — renders the current global toast (store/toast)
// as a pill above the bottom nav; auto-dismisses. Mounted once in the root
// layout so toast() works from any screen.
import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Info, X } from 'lucide-react-native';
import { useToastStore } from '@/store/toast';
import { fonts, shadows, useTheme } from '@/theme';
import { Txt } from './ui';

export function Toaster() {
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!current) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 90 }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) hide();
      });
    }, 2200);
    return () => clearTimeout(t);
  }, [current?.id]);

  if (!current) return null;

  const bg = current.variant === 'success' ? colors.success : current.variant === 'error' ? colors.danger : colors.fg1;
  const Icon = current.variant === 'success' ? Check : current.variant === 'error' ? X : Info;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + 78,
        alignItems: 'center',
        paddingHorizontal: 24,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
      }}
    >
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            maxWidth: '100%',
            paddingHorizontal: 16,
            paddingVertical: 11,
            borderRadius: 999,
            backgroundColor: bg,
          },
          shadows.card,
        ]}
      >
        <Icon size={16} color="#fff" />
        <Txt numberOfLines={1} style={{ color: '#fff', fontFamily: fonts.bodyMedium, fontSize: 13 }}>
          {current.message}
        </Txt>
      </View>
    </Animated.View>
  );
}
