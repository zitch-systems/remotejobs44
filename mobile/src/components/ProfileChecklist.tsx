// src/components/ProfileChecklist.tsx — "complete your profile" card on Profile.
// Shows the remaining in-app steps; hidden once all are done (or in demo mode).
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Check, ChevronRight, Circle } from 'lucide-react-native';
import { Card, Txt } from './ui';
import { fetchPreferences, useProfile } from '@/lib/profile';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store/app';
import { fonts, spacing, useTheme } from '@/theme';

export function ProfileChecklist() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile } = useProfile();
  const userId = useAppStore((s) => s.userId);
  const [prefs, setPrefs] = useState<{ skills: string[]; targetRole: string | null }>({ skills: [], targetRole: null });

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    fetchPreferences(userId)
      .then((p) => active && setPrefs({ skills: p.skills, targetRole: p.targetRole }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  if (!isSupabaseConfigured || !userId) return null;

  const items: { label: string; done: boolean; href: Href }[] = [
    { label: 'Add your name', done: Boolean(profile.name?.trim()), href: '/profile/edit' },
    { label: 'Upload your CV', done: Boolean(profile.cvUrl), href: '/profile/cv' },
    { label: 'Add your skills', done: prefs.skills.length > 0, href: '/profile/preferences' },
    { label: 'Set a target role', done: Boolean(prefs.targetRole?.trim()), href: '/profile/preferences' },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;

  return (
    <Card style={{ padding: spacing[4], gap: spacing[3] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt variant="h3" color={colors.fg1}>
          Complete your profile
        </Txt>
        <Txt variant="meta" color={colors.fg3}>
          {done}/{items.length}
        </Txt>
      </View>
      <View style={{ gap: spacing[1] }}>
        {items.map((it) => (
          <Pressable
            key={it.label}
            disabled={it.done}
            onPress={() => router.push(it.href)}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 7 }, pressed && { opacity: 0.6 }]}
          >
            {it.done ? <Check size={18} color={colors.success} /> : <Circle size={18} color={colors.fg4} />}
            <Txt
              style={{
                flex: 1,
                fontFamily: fonts.bodyMedium,
                fontSize: 13.5,
                color: it.done ? colors.fg4 : colors.fg1,
                textDecorationLine: it.done ? 'line-through' : 'none',
              }}
            >
              {it.label}
            </Txt>
            {!it.done ? <ChevronRight size={16} color={colors.fg5} /> : null}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
