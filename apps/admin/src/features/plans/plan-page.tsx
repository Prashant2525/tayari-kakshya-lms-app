import type { LocalizedText, PublishStatus } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PricingCard, type PricingValue } from '@/components/commerce/pricing-card';
import { CheckList } from '@/components/content/check-list';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, CardHeader, ErrorState, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { isoToNepalLocal, nepalLocalToIso, STATUS_LABEL, toLocalized, type CursorPage } from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';
import { COVERAGE_LABEL, type Coverage, type PlanDetail } from '@/lib/plans';

function useSave(planId: string) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (fn: () => Promise<unknown>, success: string) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
      await qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success(success);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, setError, save };
}

/** One plan: details and features, price and validity, courses, publishing (D-023, D-054). */
export function PlanPage() {
  const { planId } = useParams({ from: '/app/plans/$planId' });
  const plan = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => api.get<PlanDetail>(`/admin/plans/${planId}`),
  });
  if (plan.isPending) return <Spinner />;
  if (plan.isError) return <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />;
  const p = plan.data;
  const key = JSON.stringify([
    p.slug,
    p.pricing,
    p.courseIds.length,
    p.status,
    p.coverage,
    p.features.length,
  ]);
  return (
    <>
      <Link
        to="/plans"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Plans
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">{localized(p.name)}</h1>
        <StatusBadge status={p.status} publishAt={p.publishAt} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <DetailsCard key={`d${key}`} plan={p} />
          <PlanPricing key={`p${key}`} plan={p} />
          {p.coverage === 'selected' ? <CoursesCard key={`c${key}`} plan={p} /> : null}
        </div>
        <div>
          <PublishingCard key={`s${key}`} plan={p} />
        </div>
      </div>
    </>
  );
}

function DetailsCard({ plan }: { plan: PlanDetail }) {
  const s = useSave(plan.id);
  const [v, setV] = useState({
    slug: plan.slug,
    nameEn: plan.name.en ?? '',
    nameNe: plan.name.ne ?? '',
    descEn: plan.description?.en ?? '',
    descNe: plan.description?.ne ?? '',
    features: plan.features.map((f) => ({ en: f.en ?? '', ne: f.ne ?? '' })),
    coverage: plan.coverage,
    isFeatured: plan.isFeatured,
    sortOrder: String(plan.sortOrder),
  });
  const set = <K extends keyof typeof v>(k: K, next: (typeof v)[K]) => setV((x) => ({ ...x, [k]: next }));
  const submit = () => {
    const name = toLocalized(v.nameEn, v.nameNe);
    if (!name) return s.setError('Enter the plan name');
    const features = v.features
      .map((f) => toLocalized(f.en, f.ne))
      .filter((f): f is LocalizedText => f !== null);
    void s.save(
      () =>
        api.put(`/admin/plans/${plan.id}`, {
          slug: v.slug,
          name,
          description: toLocalized(v.descEn, v.descNe),
          features,
          coverage: v.coverage,
          isFeatured: v.isFeatured,
          sortOrder: Number(v.sortOrder) || 0,
        }),
      'Plan saved',
    );
  };
  return (
    <Card>
      <CardHeader title="Details" description="What students see on the plan card." />
      <div className="flex flex-col gap-4 p-5">
        {s.error ? <Alert tone="danger" title={s.error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (English)">
            {(a) => <Input {...a} value={v.nameEn} onChange={(e) => set('nameEn', e.target.value)} />}
          </Field>
          <Field label="नाम (नेपाली)">
            {(a) => (
              <Input {...a} lang="ne" value={v.nameNe} onChange={(e) => set('nameNe', e.target.value)} />
            )}
          </Field>
          <Field label="Description (English)">
            {(a) => <Input {...a} value={v.descEn} onChange={(e) => set('descEn', e.target.value)} />}
          </Field>
          <Field label="विवरण (नेपाली)">
            {(a) => (
              <Input {...a} lang="ne" value={v.descNe} onChange={(e) => set('descNe', e.target.value)} />
            )}
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-text">Features (check-list on the card)</legend>
          {v.features.map((f, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Field label={`Feature ${i + 1} (English)`}>
                {(a) => (
                  <Input
                    {...a}
                    value={f.en}
                    onChange={(e) =>
                      set(
                        'features',
                        v.features.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)),
                      )
                    }
                  />
                )}
              </Field>
              <Field label={`Feature ${i + 1} (नेपाली)`}>
                {(a) => (
                  <Input
                    {...a}
                    lang="ne"
                    value={f.ne}
                    onChange={(e) =>
                      set(
                        'features',
                        v.features.map((x, j) => (j === i ? { ...x, ne: e.target.value } : x)),
                      )
                    }
                  />
                )}
              </Field>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove feature ${i + 1}`}
                onClick={() =>
                  set(
                    'features',
                    v.features.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => set('features', [...v.features, { en: '', ne: '' }])}
          >
            <Plus /> Add feature
          </Button>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Covers">
            {(a) => (
              <Select {...a} value={v.coverage} onChange={(e) => set('coverage', e.target.value as Coverage)}>
                {(Object.keys(COVERAGE_LABEL) as Coverage[]).map((c) => (
                  <option key={c} value={c}>
                    {COVERAGE_LABEL[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Address (slug)">
            {(a) => (
              <Input {...a} value={v.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} />
            )}
          </Field>
          <Field label="Order" hint="Lower numbers first.">
            {(a) => (
              <Input
                {...a}
                inputMode="numeric"
                value={v.sortOrder}
                onChange={(e) => set('sortOrder', e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-sm border border-border p-3">
          <div>
            <p className="text-sm font-semibold text-text">Highlight</p>
            <p className="text-xs text-text-muted">Shown as the recommended plan.</p>
          </div>
          <Switch checked={v.isFeatured} onCheckedChange={(x) => set('isFeatured', x)} label="Highlight" />
        </div>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-4">
        <Button onClick={submit} loading={s.saving}>
          Save
        </Button>
      </div>
    </Card>
  );
}

function PlanPricing({ plan }: { plan: PlanDetail }) {
  const s = useSave(plan.id);
  return (
    <PricingCard
      value={plan.pricing}
      readOnly={false}
      saving={s.saving}
      error={s.error}
      onError={s.setError}
      onSave={(body: PricingValue) =>
        void s.save(() => api.put(`/admin/plans/${plan.id}/pricing`, body), 'Pricing saved')
      }
      zeroHint="Free plan: shown for comparison, not sold."
      validityHint="How long a plan lasts after buying. Renewing adds this period after the current one (D-054)."
      note="New prices apply to new purchases. iOS never shows prices (D-027)."
    />
  );
}

function CoursesCard({ plan }: { plan: PlanDetail }) {
  const s = useSave(plan.id);
  const courses = useQuery({
    queryKey: ['courses', 'all-for-plans'],
    queryFn: () =>
      api.get<CursorPage<{ id: string; title: LocalizedText; status: PublishStatus }>>('/admin/courses', {
        limit: 100,
      }),
  });
  const [selected, setSelected] = useState(plan.courseIds);
  return (
    <Card>
      <CardHeader
        title="Courses"
        description={`Students with the plan open these courses now; changes apply to the ${plan.activeSubscribers} current subscriber${plan.activeSubscribers === 1 ? '' : 's'} at once.`}
      />
      <div className="flex flex-col gap-3 p-5">
        {s.error ? <Alert tone="danger" title={s.error} /> : null}
        {courses.isPending ? (
          <Spinner />
        ) : courses.isError ? (
          <ErrorState error={courses.error} onRetry={() => void courses.refetch()} />
        ) : (
          <CheckList
            items={courses.data.data.map((c) => ({
              id: c.id,
              label: localized(c.title),
              hint: c.status === 'published' ? undefined : STATUS_LABEL[c.status],
            }))}
            selected={selected}
            onToggle={(id, on) => setSelected((x) => (on ? [...x, id] : x.filter((y) => y !== id)))}
            disabled={false}
            empty="No courses yet."
          />
        )}
      </div>
      <div className="flex justify-end border-t border-border px-5 py-4">
        <Button
          onClick={() =>
            void s.save(
              () => api.put(`/admin/plans/${plan.id}/courses`, { courseIds: selected }),
              'Courses saved',
            )
          }
          loading={s.saving}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function PublishingCard({ plan }: { plan: PlanDetail }) {
  const s = useSave(plan.id);
  const [status, setStatus] = useState<PublishStatus>(plan.status);
  const [when, setWhen] = useState(isoToNepalLocal(plan.publishAt));
  const apply = () => {
    const publishAt = status === 'scheduled' ? nepalLocalToIso(when) : null;
    if (status === 'scheduled' && !publishAt) return s.setError('Choose the date and time to publish');
    void s.save(
      () => api.put(`/admin/plans/${plan.id}/status`, { status, publishAt }),
      `Status: ${STATUS_LABEL[status]}`,
    );
  };
  return (
    <Card>
      <CardHeader
        title="Publishing"
        description={<StatusBadge status={plan.status} publishAt={plan.publishAt} />}
      />
      <div className="flex flex-col gap-4 p-5">
        {s.error ? <Alert tone="danger" title={s.error} /> : null}
        <Field label="Plan status">
          {(a) => (
            <Select {...a} value={status} onChange={(e) => setStatus(e.target.value as PublishStatus)}>
              {(['draft', 'scheduled', 'published', 'archived'] as PublishStatus[]).map((o) => (
                <option key={o} value={o}>
                  {STATUS_LABEL[o]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {status === 'scheduled' ? (
          <Field
            label="Publish at (Nepal time)"
            hint={when ? formatDateTimeBs(nepalLocalToIso(when)) : undefined}
          >
            {(a) => (
              <Input {...a} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            )}
          </Field>
        ) : null}
        <Button
          onClick={apply}
          loading={s.saving}
          disabled={status === plan.status && status !== 'scheduled'}
        >
          Update status
        </Button>
        <p className="text-xs text-text-muted">
          {plan.activeSubscribers} active subscriber{plan.activeSubscribers === 1 ? '' : 's'}. Archived plans
          are no longer sold; subscribers keep access until their plan ends.
        </p>
      </div>
    </Card>
  );
}
