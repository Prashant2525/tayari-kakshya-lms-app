import { CouponInput, type LocalizedText, type PublishStatus } from '@tk/contracts';
import { formatNpr, MoneyError, rupeesToPaisa } from '@tk/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CheckList } from '@/components/content/check-list';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge, Card, CardHeader, ErrorState, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import {
  isoToNepalLocal,
  nepalLocalToIso,
  paisaToRupeesInput,
  STATUS_LABEL,
  type CursorPage,
} from '@/lib/content';
import {
  APPLIES_TO_LABEL,
  COUPON_STATE,
  discountLabel,
  type AppliesTo,
  type CouponDetail,
} from '@/lib/coupons';
import { formatDateTimeBs, localized } from '@/lib/format';
import type { PlanRow } from '@/lib/plans';

type CourseOption = { id: string; slug: string; title: LocalizedText; status: PublishStatus };

function useCatalog() {
  const courses = useQuery({
    queryKey: ['courses', 'all-for-coupons'],
    queryFn: () => api.get<CursorPage<CourseOption>>('/admin/courses', { limit: 100 }),
  });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.get<PlanRow[]>('/admin/plans') });
  return { courses, plans };
}

/** Amounts are typed in rupees (and percentages with up to 2 decimals) and sent in paisa / basis points. */
function parseAmount(value: string): number | null | 'invalid' {
  if (!value.trim()) return null;
  try {
    return rupeesToPaisa(value.replace(/,/g, ''));
  } catch (err) {
    if (err instanceof MoneyError) return 'invalid';
    throw err;
  }
}
const toInput = (n: number | null) => (n === null ? '' : String(n));
const positiveInt = (v: string): number | null | 'invalid' =>
  !v.trim() ? null : /^\d+$/.test(v.trim()) && Number(v) > 0 ? Number(v) : 'invalid';

/** A coupon: create (`/coupons/new`) or change; usage and share links once it exists (D-025, D-054, D-056). */
export function CouponPage() {
  const { couponId } = useParams({ from: '/app/coupons/$couponId' });
  const isNew = couponId === 'new';
  const coupon = useQuery({
    queryKey: ['coupon', couponId],
    queryFn: () => api.get<CouponDetail>(`/admin/coupons/${couponId}`),
    enabled: !isNew,
  });
  if (!isNew && coupon.isPending) return <Spinner />;
  if (!isNew && coupon.isError)
    return <ErrorState error={coupon.error} onRetry={() => void coupon.refetch()} />;
  const c = isNew ? null : coupon.data!;
  return (
    <>
      <Link
        to="/coupons"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Coupons
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
          {c ? <span className="font-mono">{c.code}</span> : 'New coupon'}
        </h1>
        {c ? <Badge tone={COUPON_STATE[c.state].tone}>{COUPON_STATE[c.state].label}</Badge> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <CouponForm key={c ? JSON.stringify(c) : 'new'} coupon={c} />
        {c ? (
          <div className="flex flex-col gap-6">
            <UsageCard c={c} />
            <ShareCard c={c} />
          </div>
        ) : null}
      </div>
    </>
  );
}

function CouponForm({ coupon: c }: { coupon: CouponDetail | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({
    code: c?.code ?? '',
    note: c?.note ?? '',
    discountType: c?.discountType ?? ('percent' as 'percent' | 'fixed'),
    percent: c?.percentBps ? paisaToRupeesInput(c.percentBps) : '',
    amount: paisaToRupeesInput(c?.amountPaisa ?? null),
    maxDiscount: paisaToRupeesInput(c?.maxDiscountPaisa ?? null),
    minOrder: paisaToRupeesInput(c?.minOrderPaisa ?? null),
    startsAt: isoToNepalLocal(c?.startsAt ?? null),
    endsAt: isoToNepalLocal(c?.endsAt ?? null),
    maxRedemptions: toInput(c?.maxRedemptions ?? null),
    perUserLimit: toInput(c?.perUserLimit ?? null),
    appliesTo: c?.appliesTo ?? ('everything' as AppliesTo),
    courseIds: c?.courseIds ?? [],
    planIds: c?.planIds ?? [],
    allowOnSale: c?.allowOnSale ?? false,
    active: c?.active ?? true,
  });
  const set = <K extends keyof typeof v>(k: K, next: (typeof v)[K]) => setV((x) => ({ ...x, [k]: next }));

  const submit = async () => {
    const percent = parseAmount(v.percent);
    const amount = parseAmount(v.amount);
    const maxDiscount = parseAmount(v.maxDiscount);
    const minOrder = parseAmount(v.minOrder);
    const maxRedemptions = positiveInt(v.maxRedemptions);
    const perUserLimit = positiveInt(v.perUserLimit);
    if ([percent, amount, maxDiscount, minOrder].includes('invalid')) {
      return setError('Enter amounts as numbers, e.g. 500 or 12.5');
    }
    if (maxRedemptions === 'invalid' || perUserLimit === 'invalid') {
      return setError('Use limits are whole numbers (leave empty for no limit)');
    }
    const body = {
      code: v.code,
      note: v.note.trim() || null,
      discountType: v.discountType,
      percentBps: v.discountType === 'percent' ? percent : null,
      amountPaisa: v.discountType === 'fixed' ? amount : null,
      maxDiscountPaisa: v.discountType === 'percent' ? maxDiscount : null,
      minOrderPaisa: minOrder,
      startsAt: nepalLocalToIso(v.startsAt),
      endsAt: nepalLocalToIso(v.endsAt),
      maxRedemptions,
      perUserLimit,
      appliesTo: v.appliesTo,
      courseIds: v.appliesTo === 'selected' ? v.courseIds : [],
      planIds: v.appliesTo === 'selected' ? v.planIds : [],
      allowOnSale: v.allowOnSale,
      active: v.active,
    };
    const parsed = CouponInput.safeParse(body);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form');
    setSaving(true);
    setError(null);
    try {
      if (c) {
        await api.put(`/admin/coupons/${c.id}`, body);
        await qc.invalidateQueries({ queryKey: ['coupon', c.id] });
        toast.success('Coupon saved');
      } else {
        const created = await api.post<{ id: string }>('/admin/coupons', body);
        toast.success('Coupon created');
        void navigate({ to: '/coupons/$couponId', params: { couponId: created.id } });
      }
      await qc.invalidateQueries({ queryKey: ['coupons'] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const amountHint = (value: string) => {
    const p = parseAmount(value);
    return typeof p === 'number' ? formatNpr(p, 'en') : undefined;
  };

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Coupon"
        description="Students type the code at checkout. Changes apply to new orders; orders already made keep their discount."
      />
      <div className="flex flex-col gap-5 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="Letters, numbers and dashes. Students can type it in any case.">
            {(a) => (
              <Input
                {...a}
                className="font-mono uppercase"
                value={v.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
              />
            )}
          </Field>
          <Field label="Staff note" hint="Who it is for. Students never see it.">
            {(a) => <Input {...a} value={v.note} onChange={(e) => set('note', e.target.value)} />}
          </Field>
        </div>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold text-text">Discount</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Type">
              {(a) => (
                <Select
                  {...a}
                  value={v.discountType}
                  onChange={(e) => set('discountType', e.target.value as 'percent' | 'fixed')}
                >
                  <option value="percent">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </Select>
              )}
            </Field>
            {v.discountType === 'percent' ? (
              <>
                <Field label="Percent off" hint="100 gives the course or plan free (D-056).">
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="decimal"
                      value={v.percent}
                      onChange={(e) => set('percent', e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Largest discount (Rs)" hint={amountHint(v.maxDiscount) ?? 'Optional'}>
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="decimal"
                      value={v.maxDiscount}
                      onChange={(e) => set('maxDiscount', e.target.value)}
                    />
                  )}
                </Field>
              </>
            ) : (
              <Field label="Amount off (Rs)" hint={amountHint(v.amount) ?? 'Never more than the price.'}>
                {(a) => (
                  <Input
                    {...a}
                    inputMode="decimal"
                    value={v.amount}
                    onChange={(e) => set('amount', e.target.value)}
                  />
                )}
              </Field>
            )}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold text-text">Works for</legend>
          <Field label="Applies to">
            {(a) => (
              <Select
                {...a}
                value={v.appliesTo}
                onChange={(e) => set('appliesTo', e.target.value as AppliesTo)}
              >
                {(Object.keys(APPLIES_TO_LABEL) as AppliesTo[]).map((k) => (
                  <option key={k} value={k}>
                    {APPLIES_TO_LABEL[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {v.appliesTo === 'selected' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-text">Courses</p>
                {catalog.courses.isPending ? (
                  <Spinner />
                ) : catalog.courses.isError ? (
                  <ErrorState error={catalog.courses.error} onRetry={() => void catalog.courses.refetch()} />
                ) : (
                  <CheckList
                    items={catalog.courses.data.data.map((x) => ({
                      id: x.id,
                      label: localized(x.title),
                      hint: x.status === 'published' ? undefined : STATUS_LABEL[x.status],
                    }))}
                    selected={v.courseIds}
                    onToggle={(id, on) =>
                      set('courseIds', on ? [...v.courseIds, id] : v.courseIds.filter((y) => y !== id))
                    }
                    disabled={false}
                    empty="No courses yet."
                  />
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-text">Plans</p>
                {catalog.plans.isPending ? (
                  <Spinner />
                ) : catalog.plans.isError ? (
                  <ErrorState error={catalog.plans.error} onRetry={() => void catalog.plans.refetch()} />
                ) : (
                  <CheckList
                    items={catalog.plans.data.map((x) => ({
                      id: x.id,
                      label: localized(x.name),
                      hint: x.status === 'published' ? undefined : STATUS_LABEL[x.status],
                    }))}
                    selected={v.planIds}
                    onToggle={(id, on) =>
                      set('planIds', on ? [...v.planIds, id] : v.planIds.filter((y) => y !== id))
                    }
                    disabled={false}
                    empty="No plans yet."
                  />
                )}
              </div>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold text-text">Rules</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Starts (Nepal time)"
              hint={v.startsAt ? formatDateTimeBs(nepalLocalToIso(v.startsAt)) : 'Empty = now'}
            >
              {(a) => (
                <Input
                  {...a}
                  type="datetime-local"
                  value={v.startsAt}
                  onChange={(e) => set('startsAt', e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Ends (Nepal time)"
              hint={v.endsAt ? formatDateTimeBs(nepalLocalToIso(v.endsAt)) : 'Empty = no end'}
            >
              {(a) => (
                <Input
                  {...a}
                  type="datetime-local"
                  value={v.endsAt}
                  onChange={(e) => set('endsAt', e.target.value)}
                />
              )}
            </Field>
            <Field label="Total uses" hint="By everyone together. Empty = no limit.">
              {(a) => (
                <Input
                  {...a}
                  inputMode="numeric"
                  value={v.maxRedemptions}
                  onChange={(e) => set('maxRedemptions', e.target.value)}
                />
              )}
            </Field>
            <Field label="Uses per student" hint="Empty = no limit.">
              {(a) => (
                <Input
                  {...a}
                  inputMode="numeric"
                  value={v.perUserLimit}
                  onChange={(e) => set('perUserLimit', e.target.value)}
                />
              )}
            </Field>
            <Field label="Minimum price (Rs)" hint={amountHint(v.minOrder) ?? 'Optional'}>
              {(a) => (
                <Input
                  {...a}
                  inputMode="decimal"
                  value={v.minOrder}
                  onChange={(e) => set('minOrder', e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border p-3">
            <div>
              <p className="text-sm font-semibold text-text">Works on sale prices</p>
              <p className="text-xs text-text-muted">
                Off: the coupon does not work while a sale price applies. On: the discount is taken from the
                sale price (D-054).
              </p>
            </div>
            <Switch
              checked={v.allowOnSale}
              onCheckedChange={(x) => set('allowOnSale', x)}
              label="Works on sale prices"
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border p-3">
            <div>
              <p className="text-sm font-semibold text-text">Switched on</p>
              <p className="text-xs text-text-muted">
                Switch off to stop the code working. Coupons are never deleted.
              </p>
            </div>
            <Switch checked={v.active} onCheckedChange={(x) => set('active', x)} label="Switched on" />
          </div>
        </fieldset>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-4">
        <Button onClick={() => void submit()} loading={saving}>
          {c ? 'Save' : 'Create coupon'}
        </Button>
      </div>
    </Card>
  );
}

function UsageCard({ c }: { c: CouponDetail }) {
  return (
    <Card>
      <CardHeader title="Use" description={discountLabel(c)} />
      <div className="flex flex-col gap-3 px-5 py-4 text-sm">
        <p>
          <span className="font-semibold">{c.usedCount}</span> paid order{c.usedCount === 1 ? '' : 's'}
          {c.maxRedemptions ? ` of ${c.maxRedemptions}` : ''}
          {c.reservedCount ? ` · ${c.reservedCount} waiting for payment` : ''}
        </p>
        {c.recentOrders.length ? (
          <ul className="flex flex-col gap-2">
            {c.recentOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <Link to="/orders/$orderId" params={{ orderId: o.id }} className="text-link">
                  #{String(o.orderNo).padStart(6, '0')}
                </Link>
                <span className="min-w-0 flex-1 truncate text-text-secondary">{o.student}</span>
                <span className="whitespace-nowrap">− {formatNpr(o.discountPaisa, 'en')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-muted">Not used yet.</p>
        )}
      </div>
    </Card>
  );
}

/** A link that opens checkout with the code filled in (D-056), for Facebook, Viber and the like. */
function ShareCard({ c }: { c: CouponDetail }) {
  const catalog = useCatalog();
  const [target, setTarget] = useState('');
  if (!c.shareBaseUrl) {
    return (
      <Card>
        <CardHeader title="Share link" />
        <p className="px-5 py-4 text-sm text-text-muted">
          Share links need the student app&apos;s web address (PUBLIC_WEB_URL on the server).
        </p>
      </Card>
    );
  }
  const courses = (catalog.courses.data?.data ?? []).filter(
    (x) =>
      x.status === 'published' &&
      (c.appliesTo === 'everything' ||
        c.appliesTo === 'all_courses' ||
        (c.appliesTo === 'selected' && c.courseIds.includes(x.id))),
  );
  const plans = (catalog.plans.data ?? []).filter(
    (x) =>
      x.status === 'published' &&
      (c.appliesTo === 'everything' ||
        c.appliesTo === 'all_plans' ||
        (c.appliesTo === 'selected' && c.planIds.includes(x.id))),
  );
  const [kind, slug] = target.split(':');
  const link = slug
    ? `${c.shareBaseUrl}/checkout/${kind === 'plan' ? 'plan/' : ''}${slug}?coupon=${encodeURIComponent(c.code)}`
    : null;
  return (
    <Card>
      <CardHeader title="Share link" description="Opens checkout with the code filled in." />
      <div className="flex flex-col gap-3 px-5 py-4">
        <Field label="Link to">
          {(a) => (
            <Select {...a} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a course or plan</option>
              {courses.map((x) => (
                <option key={x.id} value={`course:${x.slug}`}>
                  {localized(x.title)}
                </option>
              ))}
              {plans.map((x) => (
                <option key={x.id} value={`plan:${x.slug}`}>
                  Plan: {localized(x.name)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {link ? (
          <>
            <Input readOnly aria-label="Share link" value={link} className="font-mono text-xs" />
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() =>
                void navigator.clipboard.writeText(link).then(
                  () => toast.success('Link copied'),
                  () => toast.error('Copy the link from the box'),
                )
              }
            >
              <Copy /> Copy link
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );
}
