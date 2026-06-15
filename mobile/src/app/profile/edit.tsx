// src/app/profile/edit.tsx — edit name + structured profile (bio, links, work
// experience). Persists to the profiles row (migration_v43 columns).
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react-native';
import { Button, Card, Field, IconButton, Txt } from '@/components/ui';
import { useProfile, saveName, fetchDetails, saveDetails } from '@/lib/profile';
import { cleanExperience, cleanLinks, normalizeUrl, type ExperienceItem } from '@/lib/profile-details';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store/app';
import { fonts, spacing, useTheme } from '@/theme';

export default function EditProfile() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile, reload } = useProfile();
  const userId = useAppStore((s) => s.userId);

  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState('');
  const [github, setGithub] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [website, setWebsite] = useState('');
  const [exp, setExp] = useState<ExperienceItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    fetchDetails(userId).then((d) => {
      if (!active) return;
      setBio(d.bio);
      setGithub(d.links.github ?? '');
      setLinkedin(d.links.linkedin ?? '');
      setWebsite(d.links.website ?? '');
      setExp(d.experience);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const updateExp = (i: number, patch: Partial<ExperienceItem>) => setExp((arr) => arr.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const addExp = () => setExp((arr) => [...arr, { title: '', company: '', period: '' }]);
  const removeExp = (i: number) => setExp((arr) => arr.filter((_, idx) => idx !== i));

  async function save() {
    if (!isSupabaseConfigured || !userId) {
      Alert.alert('Demo mode', 'Connect Supabase to edit your profile.');
      return;
    }
    try {
      setBusy(true);
      await saveName(userId, name.trim());
      await saveDetails(userId, {
        bio: bio.trim(),
        links: cleanLinks({ github: normalizeUrl(github), linkedin: normalizeUrl(linkedin), website: normalizeUrl(website) }),
        experience: cleanExperience(exp),
      });
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
        <IconButton accessibilityLabel="Go back" onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2">Edit profile</Txt>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[5], gap: spacing[5], paddingBottom: spacing[12] }}
      >
        <Field label="Full name" placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" />

        <View style={{ gap: 7 }}>
          <Txt variant="label" color={colors.fg2}>
            About you
          </Txt>
          <Card style={{ padding: spacing[4] }}>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="A short professional bio — who you are and what you do."
              placeholderTextColor={colors.fg4}
              multiline
              maxLength={600}
              textAlignVertical="top"
              style={{ minHeight: 90, fontFamily: fonts.body, fontSize: 13, color: colors.fg1, lineHeight: 20 }}
            />
          </Card>
        </View>

        <View style={{ gap: spacing[3] }}>
          <Txt variant="eyebrow" color={colors.fg4}>
            Links
          </Txt>
          <Field label="GitHub" placeholder="github.com/you" value={github} onChangeText={setGithub} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <Field label="LinkedIn" placeholder="linkedin.com/in/you" value={linkedin} onChangeText={setLinkedin} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <Field label="Website" placeholder="your-site.com" value={website} onChangeText={setWebsite} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        </View>

        <View style={{ gap: spacing[3] }}>
          <Txt variant="eyebrow" color={colors.fg4}>
            Work experience
          </Txt>
          {exp.map((e, i) => (
            <Card key={i} style={{ padding: spacing[4], gap: spacing[3] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Txt variant="cardTitle" color={colors.fg2}>
                  Role {i + 1}
                </Txt>
                <Pressable onPress={() => removeExp(i)} accessibilityRole="button" accessibilityLabel={`Remove role ${i + 1}`} hitSlop={8}>
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              </View>
              <Field placeholder="Title (e.g. Senior Frontend Engineer)" value={e.title} onChangeText={(t) => updateExp(i, { title: t })} />
              <Field placeholder="Company" value={e.company} onChangeText={(t) => updateExp(i, { company: t })} />
              <Field placeholder="Period (e.g. 2022 – present)" value={e.period} onChangeText={(t) => updateExp(i, { period: t })} autoCapitalize="none" />
            </Card>
          ))}
          <Button label="Add experience" variant="ghost" full={false} icon={<Plus size={16} color={colors.fg2} />} onPress={addExp} />
        </View>

        <Button label="Save changes" onPress={save} loading={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}
