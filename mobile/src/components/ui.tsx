// src/components/ui.tsx — the shared primitive library for RemoteJobs44 mobile.
// Everything theme-aware (light/dark) and built from the design tokens.
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  RefreshControl,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Image } from 'expo-image';
import { fonts, fontSizes, radii, shadows, spacing, tracking, useTheme } from '@/theme';

/* ------------------------------------------------------------------ Txt -- */
type TxtVariant =
  | 'screenTitle' // big screen header
  | 'h1' // auth heading
  | 'h2' // section / greeting
  | 'h3'
  | 'cardTitle'
  | 'body'
  | 'bodyLg'
  | 'label'
  | 'meta'
  | 'eyebrow'
  | 'stat';

const VARIANT: Record<TxtVariant, { font: string; size: number; lh: number; ls?: number; upper?: boolean }> = {
  screenTitle: { font: fonts.displayExtrabold, size: fontSizes.xl, lh: 1.1, ls: tracking.tight },
  h1: { font: fonts.displayExtrabold, size: 23, lh: 1.12, ls: tracking.tight },
  h2: { font: fonts.displayExtrabold, size: fontSizes.md, lh: 1.2, ls: tracking.tight },
  h3: { font: fonts.displayBold, size: fontSizes.base, lh: 1.3 },
  cardTitle: { font: fonts.displayBold, size: 13.5, lh: 1.3 },
  bodyLg: { font: fonts.body, size: fontSizes.base, lh: 1.55 },
  body: { font: fonts.body, size: fontSizes.sm, lh: 1.55 },
  label: { font: fonts.displayBold, size: fontSizes.xs, lh: 1.3 },
  meta: { font: fonts.body, size: fontSizes.xs, lh: 1.4 },
  eyebrow: { font: fonts.displayBold, size: fontSizes.xs, lh: 1.3, ls: tracking.wider, upper: true },
  stat: { font: fonts.displayExtrabold, size: fontSizes.md, lh: 1.1 },
};

export function Txt({
  variant = 'body',
  color,
  center,
  numberOfLines,
  style,
  children,
  ...rest
}: {
  variant?: TxtVariant;
  color?: string;
  center?: boolean;
  numberOfLines?: number;
  // TextProps['style'] is already StyleProp<TextStyle>; don't re-wrap it.
  style?: TextProps['style'];
  children?: React.ReactNode;
} & Omit<TextProps, 'style'>) {
  const { colors } = useTheme();
  const v = VARIANT[variant];
  const fallback = variant === 'body' || variant === 'bodyLg' ? colors.fg2 : colors.fg1;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: v.font,
          fontSize: v.size,
          lineHeight: Math.round(v.size * v.lh),
          letterSpacing: v.ls ?? 0,
          color: color ?? fallback,
          textTransform: v.upper ? 'uppercase' : 'none',
        },
        center && { textAlign: 'center' },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

/* --------------------------------------------------------------- Screen -- */
export function Screen({
  children,
  scroll,
  padded = true,
  edges = ['top'],
  contentStyle,
  refreshing,
  onRefresh,
  ...rest
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
} & ViewProps) {
  const { colors } = useTheme();
  const pad = padded ? { paddingHorizontal: spacing.screenX } : null;
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.bgApp }]} {...rest}>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[pad, { paddingBottom: spacing[10] }, contentStyle]}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/* ----------------------------------------------------------------- Card -- */
export function Card({ style, children, ...rest }: ViewProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.bgCard,
          borderRadius: radii.card,
          borderWidth: 1.5,
          borderColor: colors.border1,
        },
        shadows.card,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

/* --------------------------------------------------------------- Button -- */
type ButtonVariant = 'primary' | 'accent' | 'success' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  full = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const { colors } = useTheme();
  const bg: Record<ButtonVariant, string> = {
    primary: colors.brand,
    accent: colors.accent,
    success: colors.success,
    ghost: 'transparent',
  };
  const fg = variant === 'ghost' ? colors.fg2 : '#ffffff';
  const shadow = variant === 'primary' ? shadows.primary : variant === 'accent' ? shadows.accent : undefined;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        {
          height: 50,
          borderRadius: radii.row,
          backgroundColor: bg[variant],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing[2],
          paddingHorizontal: spacing[5],
          alignSelf: full ? 'stretch' : 'flex-start',
          borderWidth: variant === 'ghost' ? 1.5 : 0,
          borderColor: colors.border2,
          opacity: disabled ? 0.6 : 1,
        },
        shadow,
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Text style={{ fontFamily: fonts.displayBold, fontSize: 14, color: fg }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/* -------------------------------------------------- IconButton (square) -- */
export function IconButton({
  children,
  onPress,
  size = 34,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: 11,
          backgroundColor: colors.bgCard,
          borderWidth: 1.5,
          borderColor: colors.border2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed && { transform: [{ scale: 0.96 }] },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/* ----------------------------------------------------------------- Chip -- */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        {
          height: 34,
          paddingHorizontal: spacing[4],
          borderRadius: radii.field,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? colors.fg1 : colors.bgCard,
          borderWidth: 1.5,
          borderColor: active ? colors.fg1 : colors.border2,
        },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.displaySemibold,
          fontSize: 13,
          color: active ? '#ffffff' : colors.fg2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ----------------------------------------------------------------- Pill -- */
// Generic status pill (verified / match / application status / tags).
export function Pill({
  label,
  bg,
  fg,
  border,
  icon,
  small,
}: {
  label: string;
  bg: string;
  fg: string;
  border?: string;
  icon?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: small ? 8 : 10,
        paddingVertical: small ? 3 : 5,
        borderRadius: radii.pill,
        backgroundColor: bg,
        borderWidth: border ? 1 : 0,
        borderColor: border,
      }}
    >
      {icon}
      <Text style={{ fontFamily: fonts.displayBold, fontSize: small ? 10 : 11, color: fg }}>{label}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- Field -- */
export function Field({
  label,
  leading,
  trailing,
  style,
  ...inputProps
}: {
  label?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
} & TextInputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={style}>
      {label ? (
        <Txt variant="label" color={colors.fg2} style={{ marginBottom: 7 }}>
          {label}
        </Txt>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          height: 48,
          paddingHorizontal: spacing[4],
          borderRadius: radii.field,
          backgroundColor: colors.bgCard,
          borderWidth: 1.5,
          borderColor: focused ? colors.brand : colors.border2,
          ...(focused
            ? { shadowColor: colors.brand, shadowOpacity: 0.14, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 2 }
            : null),
        }}
      >
        {leading}
        <TextInput
          style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.fg1, paddingVertical: 0 }}
          placeholderTextColor={colors.fg4}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...inputProps}
        />
        {trailing}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------- LogoTile -- */
// Rounded gradient tile with a centered company initial.
export function LogoTile({ initial, grad, size = 40, radius = radii.logo }: { initial: string; grad: [string, string]; size?: number; radius?: number }) {
  const gid = React.useId();
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={grad[0]} />
            <Stop offset="1" stopColor={grad[1]} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} rx={radius} fill={`url(#${gid})`} />
      </Svg>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.displayExtrabold, fontSize: size * 0.42, color: '#fff' }}>{initial}</Text>
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- Avatar -- */
export function Avatar({ initial, size = 38, online, uri }: { initial: string; size?: number; online?: boolean; uri?: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radii.logo, backgroundColor: colors.bgSection }} contentFit="cover" transition={120} accessibilityIgnoresInvertColors />
      ) : (
        <LogoTile initial={initial} grad={['#fb923c', '#f97316']} size={size} radius={radii.logo} />
      )}
      {online ? (
        <View
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: 11,
            height: 11,
            borderRadius: 999,
            backgroundColor: colors.success,
            borderWidth: 2,
            borderColor: colors.bgApp,
          }}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------- Divider --- */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.border3 }, style]} />;
}

/* ----------------------------------------------------------- Pressable --- */
// Re-export for screens that need a raw press target with the standard scale.
export function Press({ children, style, ...rest }: PressableProps & { children?: React.ReactNode }) {
  return (
    <Pressable style={(s) => [typeof style === 'function' ? style(s) : style, s.pressed && { transform: [{ scale: 0.98 }] }]} {...rest}>
      {children as any}
    </Pressable>
  );
}
