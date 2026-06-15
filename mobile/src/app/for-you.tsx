// src/app/for-you.tsx — personalised recommendations. Server-ranked by the
// user's skills / target role (lib/jobs → recommended_jobs RPC, migration_v44),
// with a seed fallback in demo. Entered from Home.
import React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Sparkles } from 'lucide-react-native';
import { IconButton, Txt } from '@/components/ui';
import { JobCard } from '@/components/JobCard';
import { BrandLoader } from '@/components/BrandLoader';
import { useRecommendedJobs } from '@/lib/jobs';
import { radii, spacing, useTheme } from '@/theme';

export default function ForYou() {
  const { colors } = useTheme();
  const router = useRouter();
  const { jobs, loading, refresh } = useRecommendedJobs();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing.screenX, paddingTop: spacing[2] }}>
        <IconButton accessibilityLabel="Go back" onPress={() => router.back()}>
          <ArrowLeft size={18} color={colors.fg1} />
        </IconButton>
        <Txt variant="h2">For you</Txt>
      </View>

      {loading && jobs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <BrandLoader label="Finding roles for you…" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingTop: spacing[4], paddingBottom: spacing[10], gap: spacing[3] }}
          refreshControl={<RefreshControl refreshing={loading && jobs.length > 0} onRefresh={refresh} tintColor={colors.brand} />}
        >
          <Txt variant="meta" color={colors.fg3} style={{ marginBottom: spacing[1] }}>
            Ranked from your skills and target role.
          </Txt>
          {jobs.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing[16], gap: spacing[3] }}>
              <View style={{ width: 60, height: 60, borderRadius: radii.lg, backgroundColor: colors.bgSection, alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={26} color={colors.fg4} />
              </View>
              <Txt variant="h3" color={colors.fg1}>
                No recommendations yet
              </Txt>
              <Txt center color={colors.fg3} style={{ maxWidth: 260 }}>
                Add your skills in Job preferences to get roles picked for you.
              </Txt>
            </View>
          ) : (
            jobs.map((job) => <JobCard key={job.id} job={job} />)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
