// src/app/profile/settings.tsx — account & app settings: change password,
// legal links, support, app version, and in-app account deletion (the flow
// Apple/Google require). Deletion calls the `delete-account` edge function.
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { ArrowLeft, ChevronRight, FileText, KeyRound, LifeBuoy, ShieldCheck, Trash2 } from 'lucide-react-native';
import { Card, Divider, IconButton, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { deleteAccount, sendPasswordReset } from '@/lib/account';
import { isSupabaseConfigured } from '@/lib/supabase';
import { toast } from '@/store/toast';
import { fonts, spacing, useTheme } from '@/theme';

function Row({
  icon,
  label,
  danger,
  loading,
  onPress,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  loading?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 14, paddingHorizontal: spacing[4] },
          pressed && { backgroundColor: colors.bgSection },
        ]}
      >
        {icon}
        <Txt style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: danger ? colors.danger : colors.fg1 }}>{label}</Txt>
        {loading ? <ActivityIndicator color={colors.fg4} /> : !danger ? <ChevronRight size={18} color={colors.fg5} /> : null}
      </Pressable>
      {!last ? <Divider style={{ marginLeft: 52 }} /> : null}
    </>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Txt variant="eyebrow" color={colors.fg4} style={{ marginLeft: spacing[2], marginBottom: spacing[2] }}>
      {children}
    </Txt>
  );
}

export default function Settings() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const email = user?.email ?? profile.email ?? '';
  const [deleting, setDeleting] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const changePassword = async () => {
    if (!isSupabaseConfigured || !email) {
      toast('Add an email to your account first.', 'error');
      return;
    }
    try {
      await sendPasswordReset(email);
      toast('Password reset link sent to your email.', 'success');
    } catch {
      toast('Could not send the reset link. Try again.', 'error');
    }
  };

  const contactSupport = () => {
    Linking.openURL('mailto:support@remotejobs44.com?subject=RemoteJobs44%20app').catch(() =>
      toast('No email app found. Email support@remotejobs44.com', 'error'),
    );
  };

  const runDelete = async () => {
    setDeleting(true);
    try {
      if (isSupabaseConfigured) await deleteAccount();
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch {
      setDeleting(false);
      toast('Could not delete your account. Email support@remotejobs44.com', 'error');
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete account?', 'This permanently deletes your account and all your data. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: runDelete },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing.screenX, paddingTop: spacing[2] }}>
        <IconButton accessibilityLabel="Go back" onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2">Settings</Txt>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[5], paddingBottom: spacing[10], gap: spacing[5] }}
      >
        {email ? (
          <View>
            <SectionLabel>Account</SectionLabel>
            <Card style={{ padding: spacing[4], gap: 2, marginBottom: spacing[3] }}>
              <Txt variant="meta" color={colors.fg4}>
                Signed in as
              </Txt>
              <Txt style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.fg1 }} numberOfLines={1}>
                {email}
              </Txt>
            </Card>
            <Card style={{ paddingVertical: 2 }}>
              <Row icon={<KeyRound size={18} color={colors.fg3} />} label="Change password" onPress={changePassword} last />
            </Card>
          </View>
        ) : null}

        <View>
          <SectionLabel>Legal</SectionLabel>
          <Card style={{ paddingVertical: 2 }}>
            <Row icon={<ShieldCheck size={18} color={colors.fg3} />} label="Privacy Policy" onPress={() => WebBrowser.openBrowserAsync('https://remotejobs44.com/privacy')} />
            <Row icon={<FileText size={18} color={colors.fg3} />} label="Terms of Service" onPress={() => WebBrowser.openBrowserAsync('https://remotejobs44.com/terms')} last />
          </Card>
        </View>

        <View>
          <SectionLabel>Support</SectionLabel>
          <Card style={{ paddingVertical: 2 }}>
            <Row icon={<LifeBuoy size={18} color={colors.fg3} />} label="Contact support" onPress={contactSupport} last />
          </Card>
        </View>

        <View>
          <SectionLabel>Danger zone</SectionLabel>
          <Card style={{ paddingVertical: 2 }}>
            <Row icon={<Trash2 size={18} color={colors.danger} />} label="Delete account" danger loading={deleting} onPress={confirmDelete} last />
          </Card>
        </View>

        <Txt variant="meta" color={colors.fg4} center style={{ marginTop: spacing[2] }}>
          RemoteJobs44 · v{version}
        </Txt>
      </ScrollView>
    </SafeAreaView>
  );
}
