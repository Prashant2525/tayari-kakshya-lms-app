import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PaymentPoller, ReceiptButton } from '@/components/order-parts';
import { button, Card } from '@/components/ui';
import { api, ApiError, signedIn } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import type { OrderView } from '@/lib/types';

export const metadata: Metadata = { robots: { index: false } };

const CLOSED = new Set(['failed', 'cancelled', 'expired']);

/**
 * Where eSewa / Khalti send the student back (PAYMENT_RETURN_URL_WEB). Whatever the gateway said, the order's state
 * comes from the server, which confirms payments with the gateway itself.
 */
export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderId } = await searchParams;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) redirect('/account');
  if (!(await signedIn())) redirect(`/login?next=${encodeURIComponent(`/payment-result?order=${orderId}`)}`);
  const order = await api<OrderView>(`/orders/${orderId}`).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) redirect('/account');
    throw err;
  });
  const { t, npr, localized } = await getI18n();
  const item = order.items[0];
  const last = order.payments[0];
  const state =
    order.status === 'paid'
      ? 'paid'
      : order.status === 'pending' && !(last && CLOSED.has(last.status))
        ? 'waiting'
        : 'notPaid';
  const retry = item
    ? item.kind === 'plan'
      ? item.planSlug && `/checkout/plan/${item.planSlug}`
      : item.slug && `/checkout/${item.slug}`
    : null;
  return (
    <div className="mx-auto max-w-lg">
      {state === 'waiting' ? <PaymentPoller orderId={order.id} /> : null}
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <span
          aria-hidden
          className={`flex size-14 items-center justify-center rounded-full text-2xl font-bold ${
            state === 'paid'
              ? 'bg-success-soft text-success'
              : state === 'waiting'
                ? 'bg-primary-soft text-on-primary-soft'
                : 'bg-danger-soft text-danger'
          }`}
        >
          {state === 'paid' ? '✓' : state === 'waiting' ? '…' : '!'}
        </span>
        <h1 className="text-2xl font-bold text-text" aria-live="polite">
          {state === 'paid'
            ? t('payment.paid')
            : state === 'waiting'
              ? t('payment.waiting')
              : t('payment.notPaid')}
        </h1>
        <p className="text-text-secondary">
          {state === 'paid'
            ? t('payment.paidBody', { item: item ? localized(item.title) : '' })
            : state === 'waiting'
              ? t('payment.waitingBody')
              : t('payment.notPaidBody')}
        </p>
        <p className="text-sm text-text-muted">
          {t('payment.orderLine', {
            no: String(order.orderNo).padStart(6, '0'),
            amount: npr(order.totalPaisa),
          })}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          {state === 'paid' && order.receipt ? (
            <ReceiptButton orderId={order.id} label={t('payment.receipt')} />
          ) : null}
          {state === 'notPaid' && order.status === 'pending' && retry ? (
            <Link href={retry} className={button.primary}>
              {t('payment.tryAgain')}
            </Link>
          ) : null}
          <Link href="/account" className={state === 'paid' ? button.primary : button.secondary}>
            {t('payment.toAccount')}
          </Link>
        </div>
      </Card>
    </div>
  );
}
