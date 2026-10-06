import { formatNpr } from '@tk/domain';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTimeBs, localized } from '@/lib/format';
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
  PROVIDER_LABEL,
  orderNo,
  type OrderRow,
  type OrderStatus,
} from '@/lib/orders';

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Orders (Phase 11): every purchase, its payments and what needs attention. */
export function OrdersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [attention, setAttention] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  const search = useDebounced(q.trim());
  const cursor = cursors.at(-1);
  const list = useQuery({
    queryKey: ['orders', search, status, attention, cursor],
    queryFn: ({ signal }) =>
      api.get<{ data: OrderRow[]; nextCursor: string | null }>(
        '/admin/orders',
        {
          q: search || undefined,
          status: status || undefined,
          attention: attention ? 'true' : undefined,
          cursor,
          limit: 25,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Orders"
        description="Purchases and their payments. Access is granted only after the payment is confirmed with eSewa or Khalti."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <div className="relative min-w-60 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursors([]);
              }}
              placeholder="Search by order number, student name or email"
              aria-label="Search orders"
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setCursors([]);
            }}
            aria-label="Filter by status"
            className="w-40"
          >
            <option value="">All orders</option>
            {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS[s].label}
              </option>
            ))}
          </Select>
          <Button
            variant={attention ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={attention}
            onClick={() => {
              setAttention((a) => !a);
              setCursors([]);
            }}
          >
            <AlertTriangle /> Needs attention
          </Button>
        </div>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <Spinner />
        ) : list.data.data.length === 0 ? (
          <EmptyState title={search || status || attention ? 'No orders match' : 'No orders yet'} />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Order</TH>
                  <TH>Student</TH>
                  <TH>Course</TH>
                  <TH>Amount</TH>
                  <TH>Status</TH>
                  <TH>Payment</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {list.data.data.map((o) => (
                  <TR key={o.id}>
                    <TD className="whitespace-nowrap">
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: o.id }}
                        className="font-medium text-link"
                      >
                        {orderNo(o.orderNo)}
                      </Link>
                      {o.attention ? (
                        <Badge tone="danger" className="ml-2">
                          Attention
                        </Badge>
                      ) : null}
                    </TD>
                    <TD>
                      <p className="font-medium text-text">{o.student.fullName}</p>
                      <p className="text-xs text-text-muted">{o.student.contact}</p>
                    </TD>
                    <TD>{o.items.map((t) => localized(t)).join(', ')}</TD>
                    <TD className="whitespace-nowrap">{formatNpr(o.totalPaisa, 'en')}</TD>
                    <TD>
                      <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-sm">
                      {o.lastPayment
                        ? `${PROVIDER_LABEL[o.lastPayment.provider] ?? o.lastPayment.provider} · ${PAYMENT_STATUS[o.lastPayment.status].label}`
                        : '—'}
                    </TD>
                    <TD className="whitespace-nowrap">{formatDateTimeBs(o.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {cursors.length > 0 || list.data.nextCursor ? (
              <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={cursors.length === 0}
                  onClick={() => setCursors((c) => c.slice(0, -1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!list.data.nextCursor}
                  onClick={() => setCursors((c) => [...c, list.data.nextCursor as string])}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
