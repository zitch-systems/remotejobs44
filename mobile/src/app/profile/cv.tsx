// src/app/profile/cv.tsx — view / upload the user's CV (PDF or Word).
// Uploads to the `cvs` storage bucket (migration_v39) and saves the URL.
import React, { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { ArrowLeft, FileText, Upload } from 'lucide-react-native';
import { Button, Card, IconButton, Txt } from '@/components/ui';
import { uploadCv, useProfile } from '@/lib/profile';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store/app';
import { toast } from '@/store/toast';
import { radii, spacing, useTheme } from '@/theme';

export default function Cv() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile, reload } = useProfile();
  const userId = useAppStore((s) => s.userId);
  const [busy, setBusy] = useState(false);

  async function pick() {
    if (!isSupabaseConfigured || !userId) {
      Alert.alert('Demo mode', 'Connect Supabase to upload a CV.');
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    try {
      setBusy(true);
      await uploadCv(userId, res.assets[0]);
      reload();
      toast('CV uploaded', 'success');
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const hasCv = Boolean(profile.cvUrl);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing.screenX, paddingTop: spacing[2] }}>
        <IconButton onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2">My CV</Txt>
      </View>

      <View style={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[6], gap: spacing[4] }}>
        <Card style={{ padding: spacing[6], gap: spacing[3], alignItems: 'center' }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: radii.lg,
              backgroundColor: hasCv ? colors.infoBg : colors.bgSection,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileText size={28} color={hasCv ? colors.brand : colors.fg4} />
          </View>
          <Txt center color={colors.fg2}>
            {hasCv ? 'Your CV is attached to your profile.' : 'No CV uploaded yet.'}
          </Txt>
          {hasCv ? (
            <Button label="View CV" variant="ghost" full={false} onPress={() => Linking.openURL(profile.cvUrl!).catch(() => {})} />
          ) : null}
        </Card>

        <Button label={hasCv ? 'Replace CV' : 'Upload CV'} onPress={pick} loading={busy} icon={<Upload size={18} color="#fff" />} />

        <Txt variant="meta" color={colors.fg4} style={{ paddingHorizontal: spacing[2] }}>
          PDF or Word. Stored securely under your account and used to speed up applications.
        </Txt>
      </View>
    </SafeAreaView>
  );
}
