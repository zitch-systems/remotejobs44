// src/app/profile/interview-prep.tsx — AI interview prep (ai-interview-prep fn).
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, MessageSquare } from 'lucide-react-native';
import { Button, Card, IconButton, Txt } from '@/components/ui';
import { BrandLoader } from '@/components/BrandLoader';
import { prepInterview, type InterviewPrep, type InterviewQuestion } from '@/lib/ai';
import { isSupabaseConfigured } from '@/lib/supabase';
import { fonts, radii, spacing, useTheme } from '@/theme';

const LEVELS = ['Junior', 'Mid', 'Senior', 'Lead'];

export default function InterviewPrepScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [role, setRole] = useState('');
  const [level, setLevel] = useState('Mid');
  const [busy, setBusy] = useState(false);
  const [prep, setPrep] = useState<InterviewPrep | null>(null);

  async function run() {
    if (!isSupabaseConfigured) {
      Alert.alert('Demo mode', 'Connect Supabase + deploy the ai-interview-prep function to use this.');
      return;
    }
    if (role.trim().length < 2) {
      Alert.alert('Add a role', 'Enter the role you’re interviewing for.');
      return;
    }
    try {
      setBusy(true);
      setPrep(await prepInterview(role.trim(), level));
    } catch (e: any) {
      Alert.alert('Prep failed', e?.message ?? 'Please try again.');
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
        <Txt variant="h2">AI interview prep</Txt>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[5], gap: spacing[4], paddingBottom: spacing[12] }}
        >
          <View style={{ gap: 7 }}>
            <Txt variant="label" color={colors.fg2}>
              Role
            </Txt>
            <Card style={{ paddingHorizontal: spacing[4], height: 48, justifyContent: 'center' }}>
              <TextInput
                value={role}
                onChangeText={setRole}
                placeholder="e.g. Backend Engineer"
                placeholderTextColor={colors.fg4}
                style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.fg1 }}
              />
            </Card>
          </View>

          <View style={{ gap: 7 }}>
            <Txt variant="label" color={colors.fg2}>
              Level
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              {LEVELS.map((l) => {
                const active = level === l;
                return (
                  <Pressable
                    key={l}
                    onPress={() => setLevel(l)}
                    style={{
                      height: 34,
                      paddingHorizontal: spacing[4],
                      borderRadius: radii.field,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active ? colors.fg1 : colors.bgCard,
                      borderWidth: 1.5,
                      borderColor: active ? colors.fg1 : colors.border2,
                    }}
                  >
                    <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 13, color: active ? '#fff' : colors.fg2 }}>{l}</Txt>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Button label="Generate questions" onPress={run} loading={busy} icon={<MessageSquare size={18} color="#fff" />} />

          {busy ? (
            <View style={{ paddingVertical: spacing[8], alignItems: 'center' }}>
              <BrandLoader label="Preparing your questions…" />
            </View>
          ) : prep ? (
            <View style={{ gap: spacing[4] }}>
              <QSection title="Behavioural" items={prep.behavioural} />
              <QSection title="Technical" items={prep.technical} />
              <QSection title="Remote-specific" items={prep.remote} />
              <View style={{ gap: spacing[3] }}>
                <Txt variant="h3" color={colors.fg1}>
                  Red flags to avoid
                </Txt>
                <Card style={{ padding: spacing[4], gap: spacing[3] }}>
                  {prep.red_flags.map((f, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}>
                      <View style={{ marginTop: 1 }}>
                        <AlertTriangle size={15} color={colors.warnText} />
                      </View>
                      <Txt color={colors.fg2} style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>
                        {f}
                      </Txt>
                    </View>
                  ))}
                </Card>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function QSection({ title, items }: { title: string; items: InterviewQuestion[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing[3] }}>
      <Txt variant="h3" color={colors.fg1}>
        {title}
      </Txt>
      <View style={{ gap: spacing[2] }}>
        {items.map((it, i) => (
          <Card key={i} style={{ padding: spacing[4], gap: 4 }}>
            <Txt style={{ fontFamily: fonts.displayBold, fontSize: 14, color: colors.fg1, lineHeight: 19 }}>{it.q}</Txt>
            <Txt color={colors.fg3} style={{ fontSize: 13, lineHeight: 18 }}>
              {it.tip}
            </Txt>
          </Card>
        ))}
      </View>
    </View>
  );
}
