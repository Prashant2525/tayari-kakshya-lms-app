import { radius } from '@tk/design-tokens';
import { formatNpr } from '@tk/domain';
import { FileText, Receipt } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useMyOrders, useOpenReceipt, type OrderView } from '@/api/commerce';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { useTheme } from '@/theme/theme';
import { StatusChip } from '@/ui/chip';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

const STATUS_KEY = {
  paid: 'purchases.status.paid',
  refunded: 'purchases.status.refunded',
  pending: 'purchases.status.pending',
  expired: 'purchases.status.expired',
  cancelled: 'purchases.status.cancelled',
} as const;

/** Profile → Purchases: the student's orders, newest first (Phase 11). */
export default function PurchasesScreen() {
  const { t } = useT();
  const orders = useMyOrders();
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('purchases.title')}
        </Text>
      </View>
      {orders.isPending ? (
        <View style={{ gap: 10 }} aria-busy>
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.data.length === 0 ? (
        <EmptyState icon={Receipt} title={t('purchases.empty')} body={t('purchases.emptyBody')} />
      ) : (
        <FlatList
          data={orders.data}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
          renderItem={({ item }) => <Row o={item} />}
        />
      )}
    </Screen>
  );
}

function Row({ o }: { o: OrderView }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const title = o.items
    .map((i) =>
      i.kind === 'plan'
        ? t('purchases.plan', { name: localized(i.title, locale) })
        : localized(i.title, locale),
    )
    .join(', ');
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" color="textSecondary">
          {t('purchases.line', {
            no: String(o.orderNo).padStart(6, '0'),
            date: bsDate(o.paidAt ?? o.createdAt, locale),
            amount: formatNpr(o.totalPaisa, locale),
          })}
        </Text>
      </View>
      <StatusChip
        tone={o.status === 'paid' ? 'done' : o.status === 'pending' ? 'progress' : 'neutral'}
        label={t(STATUS_KEY[o.status])}
      />
      {o.receipt ? <ReceiptButton orderId={o.id} number={o.receipt.number} /> : null}
    </View>
  );
}

function ReceiptButton({ orderId, number }: { orderId: string; number: string }) {
  const { colors } = useTheme();
  const { t } = useT();
  const open = useOpenReceipt();
  return (
    <Pressable
      role="button"
      aria-label={t('purchases.receipt', { no: number })}
      onPress={() => open.mutate(orderId)}
      disabled={open.isPending}
      hitSlop={8}
      style={styles.receipt}
    >
      <FileText size={20} color={open.isError ? colors.danger : colors.link} strokeWidth={1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  receipt: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
