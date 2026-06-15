// src/app/profile/preferences.tsx — job preferences: target role + skills.
// Skills personalise the feed's match score (see lib/jobs.ts). Persisted to
// profiles (migration_v38); demo mode keeps them in memory only.
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, X } from 'lucide-react-native';
import { Button, Field, IconButton, Txt } from '@/components/ui';
import { BrandLoader } from '@/components/BrandLoader';
import { fetchPreferences, savePreferences } from '@/lib/profile';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store/app';
import { fonts, radii, spacing, useTheme } from '@/theme';

export default function Preferences() {
  const { colors } = useTheme();
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);

  const [targetRole, setTargetRole] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(Boolean(isSupabaseConfigured && userId));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    fetchPreferences(userId)
      .then((p) => {
        if (!active) return;
        setTargetRole(p.targetRole ?? '');
        setSkills(p.skills);
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId]);

  function addSkill() {
    const s = input.trim();
    if (!s) return;
    if (!skills.some((x) => x.toLowerCase() === s.toLowerCase())) setSkills((prev) => [...prev, s]);
    setInput('');
  }

  async function save() {
    if (!isSupabaseConfigured || !userId) {
      Alert.alert('Demo mode', 'Connect Supabase to save your preferences.');
      return;
    }
    try {
      setBusy(true);
      await savePreferences(userId, { skills, targetRole: targetRole.trim() || null, headline: null });
      router.back();
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing.screenX, paddingTop: spacing[2] }}>
        <IconButton onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2">Job preferences</Txt>
      </View>

      {loading ? (
        <View style={{ paddingTop: spacing[16], alignItems: 'center' }}>
          <BrandLoader />
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[6], gap: spacing[5], paddingBottom: spacing[10] }}
        >
          <Field label="Target role" placeholder="e.g. Senior Frontend Engineer" value={targetRole} onChangeText={setTargetRole} autoCapitalize="words" />

          <View style={{ gap: spacing[3] }}>
            <Txt variant="label" color={colors.fg2}>
              Skills
            </Txt>
            <Txt variant="meta" color={colors.fg3}>
              Used to rank how well each job matches you.
            </Txt>
            <Field
              placeholder="Add a skill and press enter"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={addSkill}
              returnKeyType="done"
              autoCapitalize="none"
              trailing={
                <Pressable hitSlop={8} onPress={addSkill}>
                  <Plus size={18} color={colors.brand} />
                </Pressable>
              }
            />
            {skills.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {skills.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setSkills((prev) => prev.filter((x) => x !== s))}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingLeft: 12,
                      paddingRight: 8,
                      paddingVertical: 7,
                      borderRadius: radii.pill,
                      backgroundColor: colors.infoBg,
                    }}
                  >
                    <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 12, color: colors.infoText }}>{s}</Txt>
                    <X size={13} color={colors.infoText} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <Button label="Save preferences" onPress={save} loading={busy} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
