// src/lib/haptics.ts — tiny haptic-feedback helpers. No-ops on platforms /
// devices without a haptic engine (the promise rejection is swallowed).
import * as Haptics from 'expo-haptics';

export function tapLight(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function notifySuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
