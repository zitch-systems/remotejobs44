// src/components/ReportSheet.tsx — report a problematic job listing.
// Bottom sheet with a reason picker + optional details → inserts into
// job_reports (lib/report). Styled to match FilterSheet.
import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { Button, Field, Txt } from './ui';
import { REPORT_REASONS, reportJob, type ReportReason } from '@/lib/report';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store/app';
import { toast } from '@/store/toast';
import { fonts, radii, spacing, useTheme } from '@/theme';

export function ReportSheet({ visible, onClose, jobId }: { visible: boolean; onClose: () => void; jobId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const userId = useAppStore((s) => s.userId);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setReason(null);
    setDetails('');
    onClose();
  };

  const submit = async () => {
    if (!reason || submitting) return;
    if (!isSupabaseConfigured || !userId) {
      toast('Sign in to report a job.', 'error');
      close();
      return;
    }
    setSubmitting(true);
    try {
      await reportJob(userId, jobId, reason, details.trim() || null);
      toast('Thanks — we’ll take a look.', 'success');
      close();
    } catch {
      toast('Could not submit the report. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={close} />
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
        <Txt variant="h3" color={colors.fg1}>
          Report this job
        </Txt>
        <Txt variant="meta" color={colors.fg3} style={{ marginBottom: spacing[2] }}>
          Tell us what’s wrong and we’ll review it.
        </Txt>

        {REPORT_REASONS.map((r) => {
          const selected = reason === r.key;
          return (
            <Pressable
              key={r.key}
              onPress={() => setReason(r.key)}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  paddingHorizontal: spacing[4],
                  borderRadius: radii.field,
                  backgroundColor: selected ? colors.infoBg : 'transparent',
                },
                pressed && { backgroundColor: colors.bgSection },
              ]}
            >
              <Txt style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: selected ? colors.infoText : colors.fg1 }}>{r.label}</Txt>
              {selected ? <Check size={18} color={colors.infoText} /> : null}
            </Pressable>
          );
        })}

        <Field
          placeholder="Add details (optional)"
          value={details}
          onChangeText={setDetails}
          maxLength={300}
          style={{ marginTop: spacing[3] }}
        />

        <Button label="Submit report" variant="primary" loading={submitting} disabled={!reason} onPress={submit} style={{ marginTop: spacing[4] }} />
      </View>
    </Modal>
  );
}
