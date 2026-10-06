import { formatNpr } from '@tk/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, ChevronDown, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardHeader, ErrorState, Spinner } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTimeBs, localized } from '@/lib/format';
import { RefundsCard } from '@/components/commerce/refunds-card';
import { ORDER_STATUS, PAYMENT_STATUS, PROVIDER_LABEL, orderNo, type OrderDetail } from '@/lib/orders';

const RECEIPT_EMAIL = {
  pending: 'Email being sent',
  sent: 'Emailed to the student',
  skipped: 'No email address',
  failed: 'Email failed',
} as const;

const npr = (paisa: number) => formatNpr(paisa, 'en');

/** One order: items, the access it gave, every payment attempt and what the gateway said (Phase 11). */
export function OrderPage() {
  const { orderId } = useParams({ from: '/app/orders/$orderId' });
  const order = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.get<OrderDetail>(`/admin/orders/${orderId}`),
  });
  if (order.isPending) return <Spinner />;
  if (order.isError) return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  const o = order.data;

  return (
    <>
      <Link
        to="/orders"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Orders
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
          Order {orderNo(o.orderNo)}
        </h1>
        <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Items" />
            <div className="flex flex-col gap-2 px-5 py-4">
              {o.items.map((i, n) => (
                <div key={n} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text">{localized(i.title)}</span>
                  <span className="font-medium text-text">{npr(i.pricePaisa)}</span>
                </div>
              ))}
              {o.couponCode ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text">
                    Coupon{' '}
                    {o.couponId ? (
                      <Link
                        to="/coupons/$couponId"
                        params={{ couponId: o.couponId }}
                        className="font-mono text-link"
                      >
                        {o.couponCode}
                      </Link>
                    ) : (
                      <span className="font-mono">{o.couponCode}</span>
                    )}
                  </span>
                  <span className="font-medium text-text">− {npr(o.discountPaisa)}</span>
                </div>
              ) : null}
              {o.tax && !o.tax.inclusive ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text">VAT ({o.tax.rateBps / 100}%)</span>
                  <span className="font-medium text-text">{npr(o.tax.paisa)}</span>
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="font-semibold text-text">Total</span>
                <span className="font-semibold text-text">{npr(o.totalPaisa)}</span>
              </div>
              {o.tax?.inclusive ? (
                <p className="text-right text-xs text-text-muted">
                  Includes VAT ({o.tax.rateBps / 100}%) {npr(o.tax.paisa)}
                </p>
              ) : null}
              {o.totalPaisa === 0 ? (
                <p className="text-xs text-text-muted">
                  Nothing to pay: the coupon covered the full price (D-056).
                </p>
              ) : null}
            </div>
          </Card>
          {o.paidAt ? (
            <RefundsCard
              orderId={o.id}
              orderStatus={o.status}
              totalPaisa={o.totalPaisa}
              refunds={o.refunds}
            />
          ) : null}
          <Card>
            <CardHeader
              title="Payments"
              description="Each attempt to pay, oldest first. Only a payment confirmed with the gateway completes an order."
            />
            <div className="flex flex-col divide-y divide-border">
              {o.payments.length === 0 ? (
                <p className="px-5 py-4 text-sm text-text-muted">No payment started yet.</p>
              ) : (
                o.payments.map((p) => <PaymentBlock key={p.id} orderId={o.id} p={p} />)
              )}
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Student" />
            <div className="px-5 py-4 text-sm">
              <Link
                to="/students/$studentId"
                params={{ studentId: o.student.id }}
                className="font-medium text-link"
              >
                {o.student.fullName}
              </Link>
              <p className="text-text-muted">{o.student.contact}</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-sm">
              <dt className="text-text-muted">Created</dt>
              <dd className="text-text">{formatDateTimeBs(o.createdAt)}</dd>
              <dt className="text-text-muted">Pay by</dt>
              <dd className="text-text">{formatDateTimeBs(o.expiresAt)}</dd>
              <dt className="text-text-muted">Paid</dt>
              <dd className="text-text">{formatDateTimeBs(o.paidAt)}</dd>
              <dt className="text-text-muted">Bought on</dt>
              <dd className="capitalize text-text">{o.channel}</dd>
              <dt className="text-text-muted">Receipt</dt>
              <dd className="text-text">
                {o.receipt ? (
                  <>
                    <span className="font-mono">{o.receipt.number}</span>
                    <span className="block text-xs text-text-muted">{RECEIPT_EMAIL[o.receipt.email]}</span>
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Access given" />
            <div className="px-5 py-4 text-sm">
              {o.access.length === 0 ? (
                <p className="text-text-muted">None (not paid).</p>
              ) : (
                o.access.map((a) => (
                  <p key={a.id} className="text-text">
                    <Badge tone={a.status === 'active' ? 'success' : 'neutral'} className="mr-2">
                      {a.status === 'active' ? 'Active' : a.status === 'revoked' ? 'Revoked' : 'Ended'}
                    </Badge>
                    {a.endsAt ? `until ${formatDateTimeBs(a.endsAt)}` : 'no end date'}
                    {a.revokedReason ? (
                      <span className="block text-xs text-text-muted">{a.revokedReason}</span>
                    ) : null}
                  </p>
                ))
              )}
              <p className="mt-2 text-xs text-text-muted">
                Grant or revoke access on the student&apos;s page.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function PaymentBlock({ orderId, p }: { orderId: string; p: OrderDetail['payments'][number] }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    try {
      const r = await api.post<{ status: string }>(`/admin/payments/${p.id}/check`);
      await qc.invalidateQueries({ queryKey: ['order', orderId] });
      await qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success(
        `Checked with ${PROVIDER_LABEL[p.provider]}: ${PAYMENT_STATUS[r.status as keyof typeof PAYMENT_STATUS]?.label ?? r.status}`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };
  return (
    <section className="flex flex-col gap-3 px-5 py-4" aria-label={`${PROVIDER_LABEL[p.provider]} payment`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-text">{PROVIDER_LABEL[p.provider] ?? p.provider}</span>
        <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
        <span className="text-sm text-text-secondary">{npr(p.amountPaisa)}</span>
        <span className="ml-auto text-xs text-text-muted">{formatDateTimeBs(p.initiatedAt)}</span>
      </div>
      {p.duplicate ? (
        <Alert tone="warning" title="Paid twice">
          This order was already paid by another payment. Access was not given again; decide whether to refund
          this one.
        </Alert>
      ) : null}
      {p.failureReason === 'amount_mismatch' ? (
        <Alert tone="danger" title="Different amount">
          The gateway reported a different amount from the order. No access was given; check this payment with
          the gateway.
        </Alert>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-muted">Gateway reference</dt>
        <dd className="break-all font-mono text-xs text-text">{p.providerReference ?? '—'}</dd>
        <dt className="text-text-muted">Transaction</dt>
        <dd className="break-all font-mono text-xs text-text">{p.providerTransactionId ?? '—'}</dd>
        <dt className="text-text-muted">Last checked</dt>
        <dd className="text-text">{formatDateTimeBs(p.lastCheckedAt)}</dd>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        {can('orders:manage') && p.status !== 'completed' ? (
          <Button variant="secondary" size="sm" loading={checking} onClick={() => void check()}>
            <RefreshCw /> Check with {PROVIDER_LABEL[p.provider]}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
          <ChevronDown className={open ? 'rotate-180' : ''} /> Gateway messages ({p.events.length})
        </Button>
      </div>
      {open ? (
        <ol className="flex flex-col gap-2">
          {p.events.map((e) => (
            <li key={e.id} className="rounded-sm border border-border p-3 text-xs">
              <p className="font-semibold text-text">
                {e.type} → {e.result}
                <span className="ml-2 font-normal text-text-muted">{formatDateTimeBs(e.at)}</span>
              </p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-text-secondary">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
