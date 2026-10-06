import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { Check, Crown } from 'lucide-react-native';
import { FlatList, StyleSheet, View } from 'react-native';
import { usePlans, type PlanView } from '@/api/plans';
import { validityText } from '@/features/commerce/checkout-view';
import { PricingText } from '@/features/courses/course-card';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Profile → Subscription plan: "Choose your plan" (PDF p23, D-023). Everything shown comes from the CMS. */
export default function PlansScreen() {
  const { t } = useT();
  const plans = usePlans();
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('plans.title')}
        </Text>
      </View>
      {plans.isPending ? (
        <View style={{ gap: 12 }} aria-busy>
          <Skeleton height={220} />
          <Skeleton height={220} />
        </View>
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
      ) : plans.data.length === 0 ? (
        <EmptyState icon={Crown} title={t('plans.empty')} body={t('plans.emptyBody')} />
      ) : (
        <FlatList
          data={plans.data}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={
            <Text variant="body" color="textSecondary">
              {t('plans.subtitle')}
            </Text>
          }
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          renderItem={({ item }) => <PlanCard plan={item} />}
        />
      )}
    </Screen>
  );
}

function PlanCard({ plan: p }: { plan: PlanView }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const name = localized(p.name, locale);
  // No price and no purchase button where this platform does not sell (iOS, D-027): the server sends no pricing.
  const action = p.isFree
    ? { label: t('plans.getStarted'), variant: 'secondary' as const, go: () => router.push('/courses') }
    : !p.pricing || (p.mine && p.mine.endsAt === null)
      ? null
      : {
          label: p.mine ? t('plans.renew') : t('plans.choose'),
          variant: 'primary' as const,
          go: () => router.push({ pathname: '/checkout/plan/[slug]', params: { slug: p.slug } }),
        };
  return (
    <View
      role="group"
      aria-label={name}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: p.isFeatured ? colors.primary : colors.border,
          borderWidth: p.isFeatured ? 2 : 1,
        },
      ]}
    >
      {p.isFeatured || p.mine ? (
        <View style={styles.chips}>
          {p.mine ? (
            <StatusChip
              tone="done"
              label={
                p.mine.endsAt
                  ? t('plans.mineUntil', { date: bsDate(p.mine.endsAt, locale) })
                  : t('plans.mine')
              }
            />
          ) : null}
          {p.isFeatured ? <StatusChip tone="featured" label={t('plans.featured')} /> : null}
        </View>
      ) : null}
      <Text variant="h3">{name}</Text>
      {p.description ? (
        <Text variant="bodySm" color="textSecondary">
          {localized(p.description, locale)}
        </Text>
      ) : null}
      <View style={{ gap: 2 }}>
        {p.isFree ? (
          <Text variant="label" color="success">
            {t('course.free')}
          </Text>
        ) : (
          <PricingText pricing={p.pricing} />
        )}
        <Text variant="caption" color="textSecondary">
          {validityText(p.validity, t, locale)}
        </Text>
      </View>
      {p.features.length ? (
        <View style={{ gap: 6 }}>
          {p.features.map((f, i) => (
            <View key={i} style={styles.feature}>
              <Check size={18} color={colors.success} strokeWidth={2} aria-hidden />
              <Text variant="body" style={{ flex: 1 }}>
                {localized(f, locale)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={[styles.covers, { borderTopColor: colors.border }]}>
        <Text variant="label">{t('plans.includes')}</Text>
        <Text variant="bodySm" color="textSecondary">
          {p.coverage === 'all_courses'
            ? t('plans.allCourses')
            : p.courses.length
              ? p.courses.map((c) => localized(c.title, locale)).join(' · ')
              : t('plans.noCourses')}
        </Text>
      </View>
      {action ? <Button label={action.label} variant={action.variant} onPress={action.go} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { borderRadius: radius.lg, padding: 16, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  feature: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  covers: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
});
