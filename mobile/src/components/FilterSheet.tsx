// src/components/FilterSheet.tsx — bottom-sheet filters for the feed
// (job type + experience level + date posted + remote-only + sort). Opened by
// the feed's filter button. Date-posted and remote-only are optional sections
// (rendered only when their setters are passed), so the Home feed can use the
// lighter set while the Jobs tab uses the full set.
import React from 'react';
import { Modal, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, MapPin } from 'lucide-react-native';
import { Button, Txt } from './ui';
import { DATE_OPTIONS, EXPERIENCE_LEVELS, TYPE_OPTIONS, type ExperienceLevel } from '@/lib/filters';
import { fonts, radii, spacing, useTheme } from '@/theme';

// Labels mirror TYPE_OPTIONS in lib/filters (values are the lowercase DB types).
export type JobType = 'Any' | 'Full-time' | 'Contract' | 'Part-time' | 'Internship' | 'Entry-level';
export type SortBy = 'match' | 'recent';

const SORTS: { key: SortBy; label: string }[] = [
  { key: 'match', label: 'Top match' },
  { key: 'recent', label: 'Most recent' },
];

export function FilterSheet({
  visible,
  onClose,
  type,
  setType,
  level,
  setLevel,
  sort,
  setSort,
  onReset,
  remoteOnly,
  setRemoteOnly,
  dateLabel,
  setDateLabel,
  location,
  setLocation,
}: {
  visible: boolean;
  onClose: () => void;
  type: JobType;
  setType: (t: JobType) => void;
  level: ExperienceLevel;
  setLevel: (l: ExperienceLevel) => void;
  sort: SortBy;
  setSort: (s: SortBy) => void;
  onReset?: () => void;
  // Optional, fuller filter set (Jobs tab):
  remoteOnly?: boolean;
  setRemoteOnly?: (b: boolean) => void;
  dateLabel?: string;
  setDateLabel?: (l: string) => void;
  location?: string;
  setLocation?: (l: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const OptionRow = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 13,
          paddingHorizontal: spacing[4],
          borderRadius: radii.field,
          backgroundColor: selected ? colors.infoBg : 'transparent',
        },
        pressed && { backgroundColor: colors.bgSection },
      ]}
    >
      <Txt style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: selected ? colors.infoText : colors.fg1 }}>{label}</Txt>
      {selected ? <Check size={18} color={colors.infoText} /> : null}
    </Pressable>
  );

  const Heading = ({ children, first }: { children: string; first?: boolean }) => (
    <Txt variant="eyebrow" color={colors.fg4} style={first ? undefined : { marginTop: spacing[3] }}>
      {children}
    </Txt>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '85%',
          backgroundColor: colors.bgCard,
          borderTopLeftRadius: radii.xl,
          borderTopRightRadius: radii.xl,
          paddingHorizontal: spacing[5],
          paddingTop: spacing[3],
          paddingBottom: Math.max(spacing[5], insets.bottom + spacing[3]),
        }}
      >
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border2, marginBottom: spacing[3] }} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing[2], paddingBottom: spacing[2] }}>
          <Heading first>Job type</Heading>
          {TYPE_OPTIONS.map((t) => (
            <OptionRow key={t.label} label={t.label} selected={type === t.label} onPress={() => setType(t.label as JobType)} />
          ))}

          <Heading>Experience level</Heading>
          {EXPERIENCE_LEVELS.map((l) => (
            <OptionRow key={l} label={l} selected={level === l} onPress={() => setLevel(l)} />
          ))}

          {setDateLabel ? (
            <>
              <Heading>Date posted</Heading>
              {DATE_OPTIONS.map((d) => (
                <OptionRow
                  key={d.label}
                  label={d.label}
                  selected={(dateLabel ?? 'Any time') === d.label}
                  onPress={() => setDateLabel(d.label)}
                />
              ))}
            </>
          ) : null}

          {setLocation ? (
            <>
              <Heading>Location</Heading>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing[3],
                  height: 46,
                  paddingHorizontal: spacing[4],
                  borderRadius: radii.field,
                  backgroundColor: colors.bgSection,
                  borderWidth: 1.5,
                  borderColor: colors.border2,
                }}
              >
                <MapPin size={16} color={colors.fg4} />
                <TextInput
                  value={location ?? ''}
                  onChangeText={setLocation}
                  placeholder="City or country, e.g. London, Lagos, Remote"
                  placeholderTextColor={colors.fg4}
                  autoCapitalize="words"
                  style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.fg1, paddingVertical: 0 }}
                />
              </View>
            </>
          ) : null}

          {setRemoteOnly ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                paddingHorizontal: spacing[4],
                marginTop: spacing[2],
              }}
            >
              <Txt style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.fg1 }}>Remote only</Txt>
              <Switch
                value={Boolean(remoteOnly)}
                onValueChange={setRemoteOnly}
                trackColor={{ false: colors.border2, true: colors.brand }}
                thumbColor="#fff"
              />
            </View>
          ) : null}

          <Heading>Sort by</Heading>
          {SORTS.map((s) => (
            <OptionRow key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[3] }}>
          {onReset ? (
            <Pressable
              onPress={onReset}
              accessibilityRole="button"
              accessibilityLabel="Reset filters"
              style={({ pressed }) => [{ paddingVertical: 12, paddingHorizontal: spacing[2] }, pressed && { opacity: 0.6 }]}
            >
              <Txt style={{ fontFamily: fonts.displayBold, fontSize: 14, color: colors.fg2 }}>Reset</Txt>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button label="Show results" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
