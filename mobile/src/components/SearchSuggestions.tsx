// src/components/SearchSuggestions.tsx — recent + popular search terms, shown
// under the feed search field when it's focused.
import React from 'react';
import { Pressable, View } from 'react-native';
import { Clock, Search, X } from 'lucide-react-native';
import { Card, Txt } from './ui';
import { useSearchHistory } from '@/store/search';
import { fonts, spacing, useTheme } from '@/theme';

const POPULAR = ['React', 'Python', 'Design', 'Marketing', 'DevOps', 'Senior', 'Remote'];

export function SearchSuggestions({ onSelect }: { onSelect: (q: string) => void }) {
  const { colors } = useTheme();
  const recent = useSearchHistory((s) => s.recent);
  const remove = useSearchHistory((s) => s.remove);
  const clear = useSearchHistory((s) => s.clear);

  return (
    <Card style={{ padding: spacing[3], gap: spacing[4] }}>
      {recent.length > 0 ? (
        <View style={{ gap: spacing[2] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt variant="eyebrow" color={colors.fg4}>
              Recent
            </Txt>
            <Pressable onPress={clear} hitSlop={8}>
              <Txt variant="meta" color={colors.brand}>
                Clear
              </Txt>
            </Pressable>
          </View>
          {recent.map((term) => (
            <View key={term} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 4 }}>
              <Clock size={15} color={colors.fg4} />
              <Pressable style={{ flex: 1 }} onPress={() => onSelect(term)}>
                <Txt color={colors.fg1} style={{ fontSize: 14 }} numberOfLines={1}>
                  {term}
                </Txt>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => remove(term)}>
                <X size={14} color={colors.fg4} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: spacing[2] }}>
        <Txt variant="eyebrow" color={colors.fg4}>
          Popular
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {POPULAR.map((term) => (
            <Pressable
              key={term}
              onPress={() => onSelect(term)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: colors.border2,
                backgroundColor: colors.bgCard,
              }}
            >
              <Search size={12} color={colors.fg4} />
              <Txt style={{ fontFamily: fonts.displaySemibold, fontSize: 12.5, color: colors.fg2 }}>{term}</Txt>
            </Pressable>
          ))}
        </View>
      </View>
    </Card>
  );
}
