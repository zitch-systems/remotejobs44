// src/components/FilterSheet.tsx — bottom-sheet filters for the feed
// (job type + sort). Opened by the feed's filter button.
import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { Txt } from './ui';
import { fonts, radii, spacing, useTheme } from '@/theme';

export type JobType = 'Any' | 'Full-time' | 'Contract' | 'Part-time';
export type SortBy = 'match' | 'recent';

const TYPES: JobType[] = ['Any', 'Full-time', 'Contract', 'Part-time'];
const SORTS: { key: SortBy; label: string }[] = [
  { key: 'match', label: 'Top match' },
  { key: 'recent', label: 'Most recent' },
];

export function FilterSheet({
  visible,
  onClose,
  type,
  setType,
  sort,
  setSort,
}: {
  visible: boolean;
  onClose: () => void;
  type: JobType;
  setType: (t: JobType) => void;
  sort: SortBy;
  setSort: (s: SortBy) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const OptionRow = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.bgCard,
          borderTopLeftRadius: radii.xl,
          borderTopRightRadius: radii.xl,
          paddingHorizontal: spacing[5],
          paddingTop: spacing[3],
          paddingBottom: Math.max(spacing[5], insets.bottom + spacing[3]),
          gap: spacing[2],
        }}
      >
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border2, marginBottom: spacing[3] }} />
        <Txt variant="eyebrow" color={colors.fg4}>
          Job type
        </Txt>
        {TYPES.map((t) => (
          <OptionRow key={t} label={t} selected={type === t} onPress={() => setType(t)} />
        ))}
        <Txt variant="eyebrow" color={colors.fg4} style={{ marginTop: spacing[3] }}>
          Sort by
        </Txt>
        {SORTS.map((s) => (
          <OptionRow key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
        ))}
      </View>
    </Modal>
  );
}
