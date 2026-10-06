import { formatNpr } from '@tk/domain';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Clock, XCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { refreshAfterPurchase, useOrder } from '@/api/commerce';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Card, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** How long the screen waits for the gateway's confirmation before suggesting to check later. */
const WAIT_MS = 90_000;

/**
 * Where the student lands after paying (deep link / website return). Shows what the server confirmed, asking the
 * gateway again while it is still open; a payment the student may have made is never shown as failed early.
 */
export default function PaymentResultScreen() {
  const { order: orderId } = useLocalSearchParams<{ order: string }>();
  const { colors } = useTheme();
  const { t, locale } = useT();
  const [waiting, setWaiting] = useState(true);
  const order = useOrder(orderId ?? '', waiting);
  const status = order.data?.status;
  const last = order.data?.payments[0];

  useEffect(() => {
    const timer = setTimeout(() => setWaiting(false), WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (status === 'paid') refreshAfterPurchase();
  }, [status]);

  if (order.isPending) {
    return (
      <Screen edges={['top']} contentStyle={styles.content}>
        <Skeleton height={200} />
      </Screen>
    );
  }
  if (order.isError) return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  const o = order.data;
  const item = o.items[0];
  const title = item ? localized(item.title, locale) : '';
  const closedAttempt = last && ['failed', 'cancelled', 'expired'].includes(last.status);
  const state: 'paid' | 'waiting' | 'notPaid' =
    o.status === 'paid'
      ? 'paid'
      : o.status !== 'pending' || closedAttempt || !waiting
        ? 'notPaid'
        : 'waiting';

  const isPlan = item?.kind === 'plan';
  const goCourse = () =>
    isPlan
      ? router.replace('/courses')
      : item?.slug
        ? router.replace({ pathname: '/course/[slug]', params: { slug: item.slug } })
        : router.replace('/');
  const tryAgain = isPlan
    ? item.planSlug
      ? () => router.replace({ pathname: '/checkout/plan/[slug]', params: { slug: item.planSlug! } })
      : null
    : item?.slug
      ? () => router.replace({ pathname: '/checkout/[slug]', params: { slug: item.slug! } })
      : null;

  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.content}>
      <Card style={styles.card}>
        {state === 'paid' ? (
          <CheckCircle2 size={48} color={colors.success} strokeWidth={1.5} />
        ) : state === 'waiting' ? (
          <Clock size={48} color={colors.onPrimarySoft} strokeWidth={1.5} />
        ) : (
          <XCircle size={48} color={colors.danger} strokeWidth={1.5} />
        )}
        <Text variant="h3" align="center" role="heading">
          {state === 'paid'
            ? t('payment.paid')
            : state === 'waiting'
              ? t('payment.waiting')
              : t('payment.notPaid')}
        </Text>
        <Text variant="body" color="textSecondary" align="center">
          {state === 'paid'
            ? t('payment.paidBody', { course: title })
            : state === 'waiting'
              ? t('payment.waitingBody')
              : t('payment.notPaidBody')}
        </Text>
        <Text variant="caption" color="textMuted" align="center">
          {t('payment.orderLine', {
            no: String(o.orderNo).padStart(6, '0'),
            amount: formatNpr(o.totalPaisa, locale),
          })}
        </Text>
      </Card>
      {state === 'paid' ? (
        <Button label={t('payment.startLearning')} onPress={goCourse} />
      ) : state === 'notPaid' ? (
        <View style={{ gap: 10 }}>
          {o.status === 'pending' && tryAgain ? (
            <Button label={t('payment.tryAgain')} onPress={tryAgain} />
          ) : null}
          <Button
            label={isPlan ? t('payment.backToPlans') : t('payment.backToCourse')}
            variant="secondary"
            onPress={isPlan ? () => router.replace('/plans') : goCourse}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingTop: 24, justifyContent: 'center' },
  card: { alignItems: 'center', gap: 10, paddingVertical: 28 },
});
