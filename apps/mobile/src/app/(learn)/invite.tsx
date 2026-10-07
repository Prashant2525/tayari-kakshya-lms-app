import { radius } from '@tk/design-tokens';
import { formatNpr } from '@tk/domain';
import { Gift, Share2 } from 'lucide-react-native';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useReferral, type Discount } from '@/api/referrals';
import type { Locale, Translate } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { BackButton, Card, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** "10%", "10% (up to Rs 500)" or "Rs 300". */
function amount(d: Discount, t: Translate, locale: Locale) {
  if (d.type === 'fixed') return formatNpr(d.amountPaisa ?? 0, locale);
  const value = String((d.percentBps ?? 0) / 100);
  return d.maxDiscountPaisa
    ? t('invite.upTo', { value, max: formatNpr(d.maxDiscountPaisa, locale) })
    : t('invite.percent', { value });
}

const STATE_TONE = { available: 'done', used: 'neutral', expired: 'neutral', cancelled: 'neutral' } as const;

/** Profile → Invite friends (D-058): the student's code to share, what each side gets, and their reward coupons. */
export default function InviteScreen() {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const referral = useReferral();
  const r = referral.data;
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('invite.title')}
        </Text>
      </View>
      {referral.isPending ? (
        <Skeleton height={220} />
      ) : referral.isError ? (
        <ErrorState error={referral.error} onRetry={() => void referral.refetch()} />
      ) : !r?.enabled || !r.code ? (
        <EmptyState icon={Gift} title={t('invite.off')} />
      ) : (
        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
          <Card style={{ gap: 10, alignItems: 'center' }}>
            <Text variant="label" color="textSecondary">
              {t('invite.yourCode')}
            </Text>
            <Text
              variant="display"
              weight={700}
              selectable
              style={[styles.code, { color: colors.text, borderColor: colors.borderStrong }]}
              aria-label={`${t('invite.yourCode')} ${r.code.split('').join(' ')}`}
            >
              {r.code}
            </Text>
            {r.friendDiscount ? (
              <Text variant="body" align="center">
                {t('invite.friendGets', { discount: amount(r.friendDiscount, t, locale) })}
              </Text>
            ) : null}
            {r.reward ? (
              <Text variant="bodySm" color="textSecondary" align="center">
                {t('invite.youGet', { discount: amount(r.reward, t, locale), days: r.reward.validDays ?? 0 })}
              </Text>
            ) : null}
            <Button
              label={t('invite.share')}
              icon={<Share2 size={18} color={colors.onPrimary} strokeWidth={1.75} />}
              onPress={() =>
                void Share.share({
                  message: r.link
                    ? t('invite.shareMessage', { code: r.code!, url: r.link })
                    : t('invite.shareMessageNoLink', { code: r.code! }),
                }).catch(() => undefined)
              }
              style={{ alignSelf: 'stretch' }}
            />
          </Card>
          <Text variant="bodySm" color="textSecondary">
            {t('invite.stats', { joined: r.joined, rewarded: r.rewarded })}
          </Text>
          <Text variant="h4" role="heading">
            {t('invite.rewards')}
          </Text>
          {r.rewards.length === 0 ? (
            <Text variant="body" color="textSecondary">
              {t('invite.noRewards')}
            </Text>
          ) : (
            r.rewards.map((c) => (
              <View
                key={c.code}
                style={[styles.reward, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" weight={600} selectable>
                    {c.code}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {amount(c, t, locale)}
                    {c.endsAt && c.state === 'available'
                      ? ` · ${t('invite.until', { date: bsDate(c.endsAt, locale) })}`
                      : ''}
                  </Text>
                </View>
                <StatusChip tone={STATE_TONE[c.state]} label={t(`invite.state.${c.state}`)} />
              </View>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  code: {
    letterSpacing: 4,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
