import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { CursorPage } from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';
import { orderNo } from '@/lib/orders';
import { REFUND_STATUS, type RefundStatus, type RefundView } from '@/lib/refunds';
import { formatNpr } from '@tk/domain';

/** Refunds (D-026, D-057): the queue to approve, and the approved ones waiting for the money to be sent. */
export function RefundsPage() {
  const [status, setStatus] = useState<'' | RefundStatus>('requested');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const list = useQuery({
    queryKey: ['refunds', status, cursor],
    queryFn: ({ signal }) =>
      api.get<CursorPage<RefundView>>(
        '/admin/refunds',
        { status: status || undefined, cursor, limit: 25 },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Refunds"
        description="Requests are made on the order page. Approve or reject them; after sending the money back, record its reference."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <Select
            aria-label="Show"
            className="w-64"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setCursors([]);
            }}
          >
            <option value="requested">Waiting for approval</option>
            <option value="approved">Approved — send the money</option>
            <option value="refunded">Refunded</option>
            <option value="rejected">Rejected</option>
            <option value="">All refunds</option>
          </Select>
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.data.length === 0 ? (
          <EmptyState title="No refunds here" description="Refunds are requested from an order's page." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Order</TH>
                  <TH>Student</TH>
                  <TH>Amount</TH>
                  <TH>Reason</TH>
                  <TH>Asked</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {list.data.data.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: r.order.id }}
                        className="font-medium text-link"
                      >
                        {orderNo(r.order.orderNo)}
                      </Link>
                      <p className="text-xs text-text-muted">
                        {r.order.items.map((i) => localized(i)).join(', ')}
                      </p>
                    </TD>
                    <TD className="text-sm">{r.order.student.fullName}</TD>
                    <TD className="whitespace-nowrap text-sm">
                      {formatNpr(r.amountPaisa, 'en')}
                      <span className="block text-xs text-text-muted">
                        of {formatNpr(r.order.totalPaisa, 'en')}
                      </span>
                    </TD>
                    <TD className="max-w-72 text-sm">{r.reason}</TD>
                    <TD className="whitespace-nowrap text-sm">
                      {formatDateTimeBs(r.requestedAt)}
                      <span className="block text-xs text-text-muted">{r.requestedBy?.fullName}</span>
                    </TD>
                    <TD>
                      <Badge tone={REFUND_STATUS[r.status].tone}>{REFUND_STATUS[r.status].label}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {cursors.length || list.data.nextCursor ? (
              <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!cursors.length}
                  onClick={() => setCursors((c) => c.slice(0, -1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!list.data.nextCursor}
                  onClick={() => setCursors((c) => [...c, list.data.nextCursor!])}
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
