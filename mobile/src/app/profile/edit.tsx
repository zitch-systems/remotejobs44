// src/app/profile/edit.tsx — edit the signed-in user's display name.
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Button, Field, IconButton, Txt } from '@/components/ui';
import { useProfile, saveName } from '@/lib/profile';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store/app';
import { spacing, useTheme } from '@/theme';

export default function EditProfile() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile, reload } = useProfile();
  const userId = useAppStore((s) => s.userId);
  const [name, setName] = useState(profile.name);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!isSupabaseConfigured || !userId) {
      Alert.alert('Demo mode', 'Connect Supabase to edit your profile.');
      return;
    }
    try {
      setBusy(true);
      await saveName(userId, name.trim());
      reload();
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
        <Txt variant="h2">Edit profile</Txt>
      </View>
      <View style={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[6], gap: spacing[5] }}>
        <Field label="Full name" placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Button label="Save changes" onPress={save} loading={busy} />
      </View>
    </SafeAreaView>
  );
}
