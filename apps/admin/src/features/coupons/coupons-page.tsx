import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { APPLIES_TO_LABEL, COUPON_STATE, discountLabel, type CouponRow } from '@/lib/coupons';
import type { CursorPage } from '@/lib/content';
import { formatDateTimeBs } from '@/lib/format';

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Coupons (D-025): codes students type at checkout or open from a share link. */
export function CouponsPage() {
  const [q, setQ] = useState('');
  const [state, setState] = useState<'' | 'active' | 'inactive'>('');
  const [cursors, setCursors] = useState<string[]>([]);
  const search = useDebounced(q.trim());
  const cursor = cursors.at(-1);
  const list = useQuery({
    queryKey: ['coupons', search, state, cursor],
    queryFn: ({ signal }) =>
      api.get<CursorPage<CouponRow>>(
        '/admin/coupons',
        {
          limit: 50,
          ...(search ? { q: search } : {}),
          ...(state ? { state } : {}),
          ...(cursor ? { cursor } : {}),
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Coupons"
        description="Discount codes. The server checks every rule and works out the discount; orders keep the discount they were given."
        actions={
          <Button asChild>
            <Link to="/coupons/$couponId" params={{ couponId: 'new' }}>
              <Plus /> New coupon
            </Link>
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              aria-label="Search coupons"
              placeholder="Code or note"
              className="pl-9"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursors([]);
              }}
            />
          </div>
          <Select
            aria-label="Show"
            className="w-44"
            value={state}
            onChange={(e) => {
              setState(e.target.value as typeof state);
              setCursors([]);
            }}
          >
            <option value="">All coupons</option>
            <option value="active">Switched on</option>
            <option value="inactive">Switched off</option>
          </Select>
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.data.length === 0 ? (
          <EmptyState
            title={search || state ? 'No coupons match' : 'No coupons yet'}
            description="Create a code, choose its discount and where it works."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Discount</TH>
                  <TH>Works for</TH>
                  <TH>Used</TH>
                  <TH>Ends</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {list.data.data.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link
                        to="/coupons/$couponId"
                        params={{ couponId: c.id }}
                        className="font-mono font-medium text-link"
                      >
                        {c.code}
                      </Link>
                      {c.note ? <p className="text-xs text-text-muted">{c.note}</p> : null}
                    </TD>
                    <TD className="text-sm">{discountLabel(c)}</TD>
                    <TD className="text-sm">{APPLIES_TO_LABEL[c.appliesTo]}</TD>
                    <TD className="text-sm">
                      {c.usedCount}
                      {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}
                    </TD>
                    <TD className="whitespace-nowrap text-sm">
                      {c.endsAt ? formatDateTimeBs(c.endsAt) : 'No end'}
                    </TD>
                    <TD>
                      <Badge tone={COUPON_STATE[c.state].tone}>{COUPON_STATE[c.state].label}</Badge>
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
