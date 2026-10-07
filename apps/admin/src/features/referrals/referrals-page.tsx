import { formatNpr } from '@tk/domain';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { CursorPage } from '@/lib/content';
import { formatDateTimeBs } from '@/lib/format';
import { orderNo } from '@/lib/orders';

const STATUS = {
  joined: { label: 'Signed up', tone: 'primary' },
  rewarded: { label: 'Rewarded', tone: 'success' },
  cancelled: { label: 'Refunded — reward off', tone: 'neutral' },
} as const;
type Status = keyof typeof STATUS;

interface ReferralRow {
  id: string;
  status: Status;
  code: string;
  createdAt: string;
  rewardedAt: string | null;
  referrer: { id: string; fullName: string };
  referee: { id: string; fullName: string };
  firstOrder: { id: string; orderNo: number; totalPaisa: number; discountPaisa: number } | null;
  rewardCoupon: { id: string; code: string; active: boolean } | null;
}

/** Referrals (D-058): who invited whom, the friend's first purchase and the reward coupon. */
export function ReferralsPage() {
  const [status, setStatus] = useState<'' | Status>('');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const list = useQuery({
    queryKey: ['referrals', status, cursor],
    queryFn: ({ signal }) =>
      api.get<CursorPage<ReferralRow>>(
        '/admin/referrals',
        { status: status || undefined, cursor, limit: 25 },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Referrals"
        description="Set the discounts and switch the programme on in System settings → Referral programme."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <Select
            aria-label="Show"
            className="w-56"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setCursors([]);
            }}
          >
            <option value="">All referrals</option>
            <option value="joined">Signed up, not bought yet</option>
            <option value="rewarded">Rewarded</option>
            <option value="cancelled">Refunded — reward off</option>
          </Select>
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.data.length === 0 ? (
          <EmptyState
            title="No referrals yet"
            description="Friends who sign up with a student's code appear here."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Invited by</TH>
                  <TH>Friend</TH>
                  <TH>Joined</TH>
                  <TH>First purchase</TH>
                  <TH>Reward</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {list.data.data.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link
                        to="/students/$studentId"
                        params={{ studentId: r.referrer.id }}
                        className="text-link"
                      >
                        {r.referrer.fullName}
                      </Link>
                      <p className="font-mono text-xs text-text-muted">{r.code}</p>
                    </TD>
                    <TD>
                      <Link
                        to="/students/$studentId"
                        params={{ studentId: r.referee.id }}
                        className="text-link"
                      >
                        {r.referee.fullName}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap text-sm">{formatDateTimeBs(r.createdAt)}</TD>
                    <TD className="text-sm">
                      {r.firstOrder ? (
                        <>
                          <Link
                            to="/orders/$orderId"
                            params={{ orderId: r.firstOrder.id }}
                            className="text-link"
                          >
                            {orderNo(r.firstOrder.orderNo)}
                          </Link>{' '}
                          {formatNpr(r.firstOrder.totalPaisa, 'en')}
                          {r.firstOrder.discountPaisa ? (
                            <span className="block text-xs text-text-muted">
                              − {formatNpr(r.firstOrder.discountPaisa, 'en')}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="text-sm">
                      {r.rewardCoupon ? (
                        <Link
                          to="/coupons/$couponId"
                          params={{ couponId: r.rewardCoupon.id }}
                          className="font-mono text-link"
                        >
                          {r.rewardCoupon.code}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD>
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
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
