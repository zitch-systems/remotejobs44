// src/components/JobDetailBody.tsx — the reusable job-detail content
// (company row → meta → match band → About / Duties / Skills). Shared by the
// phone route (app/job/[id].tsx) and the tablet master–detail pane so the two
// never drift. Header chrome + apply affordance are supplied by each host.
import React from 'react';
import { View } from 'react-native';
import type { Job } from '@/lib/types';
import { Card, Pill, Txt } from './ui';
import { CompanyLogo } from './CompanyLogo';
import { MatchRing } from './MatchRing';
import { radii, spacing, useTheme } from '@/theme';

export function verdictKicker(match: number) {
  if (match >= 85) return 'Strong match';
  if (match >= 75) return 'Good match';
  return 'Fair match';
}

function MetaCard({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, padding: spacing[3], gap: 2 }}>
      <Txt variant="eyebrow" color={colors.fg4}>
        {label}
      </Txt>
      <Txt variant="cardTitle" color={colors.fg1} numberOfLines={1}>
        {value}
      </Txt>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing[3] }}>
      <Txt variant="h3" color={colors.fg1}>
        {title}
      </Txt>
      {children}
    </View>
  );
}

export function JobDetailBody({
  job,
  showCompanyRow = true,
  actions,
}: {
  job: Job;
  /** Hide the logo+role row when the host already renders a cover for it. */
  showCompanyRow?: boolean;
  /** Optional inline action row rendered under the company row (tablet pane). */
  actions?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing[4] }}>
      {showCompanyRow ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <CompanyLogo job={job} size={54} radius={radii.lg} />
          <View style={{ flex: 1 }}>
            <Txt variant="h2" numberOfLines={2}>
              {job.role}
            </Txt>
            <Txt variant="meta" color={colors.fg3}>
              {job.company}
              {job.verified ? ' · Verified employer' : ''}
            </Txt>
          </View>
        </View>
      ) : null}

      {actions}

      {/* meta cards */}
      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <MetaCard label="Location" value={job.location.replace(/^Remote · /, '')} />
        <MetaCard label="Type" value={job.type} />
        <MetaCard label="Level" value={job.level} />
      </View>

      {/* match band */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4], padding: spacing[4] }}>
        <MatchRing pct={job.match} size={78} />
        <View style={{ flex: 1, gap: 3 }}>
          <Txt variant="eyebrow" color={colors.success}>
            {verdictKicker(job.match)}
          </Txt>
          <Txt variant="h3" color={colors.fg1}>
            {job.verdict}
          </Txt>
          <Txt variant="meta" color={colors.fg3}>
            {job.vcap}
          </Txt>
        </View>
      </Card>

      <Section title="About the role">
        <Txt color={colors.fg2} style={{ fontSize: 14, lineHeight: 22 }}>
          {job.about}
        </Txt>
      </Section>

      <Section title="What you'll do">
        <View style={{ gap: spacing[2] }}>
          {job.duties.map((d, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 7 }} />
              <Txt color={colors.fg2} style={{ flex: 1, fontSize: 14, lineHeight: 21 }}>
                {d}
              </Txt>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Skills">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {job.skills.map((s) => (
            <Pill key={s} label={s} bg={colors.infoBg} fg={colors.infoText} />
          ))}
        </View>
      </Section>
    </View>
  );
}
