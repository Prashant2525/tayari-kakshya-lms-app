import { formatNpr } from '@tk/domain';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { Alert, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { toLocalized } from '@/lib/content';
import { localized } from '@/lib/format';
import { COVERAGE_LABEL, type PlanRow } from '@/lib/plans';

/** Plans (D-023, D-054): subscriptions that open a set of courses (or all) while active. */
export function PlansPage() {
  const list = useQuery({ queryKey: ['plans'], queryFn: () => api.get<PlanRow[]>('/admin/plans') });
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Plans"
        description="Subscriptions students buy instead of single courses. While a plan is active it opens the courses it contains now."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New plan
          </Button>
        }
      />
      <Card>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState
            title="No plans yet"
            description="Create a plan, set its price and choose its courses."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Plan</TH>
                <TH>Covers</TH>
                <TH>Price</TH>
                <TH>Subscribers</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {list.data.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link to="/plans/$planId" params={{ planId: p.id }} className="font-medium text-link">
                      {localized(p.name)}
                    </Link>
                    <p className="text-xs text-text-muted">/{p.slug}</p>
                  </TD>
                  <TD className="text-sm">
                    {p.coverage === 'all_courses'
                      ? COVERAGE_LABEL.all_courses
                      : `${p.courseCount} course${p.courseCount === 1 ? '' : 's'}`}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {p.pricePaisa === 0 ? 'Free (not sold)' : formatNpr(p.effectivePricePaisa, 'en')}
                  </TD>
                  <TD>{p.activeSubscribers}</TD>
                  <TD>
                    <StatusBadge status={p.status} publishAt={p.publishAt} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {creating ? <NewPlanDialog onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function NewPlanDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [v, setV] = useState({ en: '', ne: '', slug: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const create = async () => {
    const name = toLocalized(v.en, v.ne);
    if (!name) return setError('Enter the plan name');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.slug)) {
      return setError('Address: lowercase letters, numbers and dashes, e.g. premium-yearly');
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<{ id: string }>('/admin/plans', {
        slug: v.slug,
        name,
        description: null,
        features: [],
        coverage: 'selected',
        isFeatured: false,
        sortOrder: 0,
      });
      void navigate({ to: '/plans/$planId', params: { planId: created.id } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New plan"
      description="You set its price, validity and courses next. It stays a draft until you publish it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void create()} loading={saving}>
            Create plan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (English)">
            {(a) => <Input {...a} value={v.en} onChange={(e) => setV({ ...v, en: e.target.value })} />}
          </Field>
          <Field label="नाम (नेपाली)">
            {(a) => (
              <Input {...a} lang="ne" value={v.ne} onChange={(e) => setV({ ...v, ne: e.target.value })} />
            )}
          </Field>
        </div>
        <Field label="Address (slug)" hint="Used in links, e.g. premium-yearly.">
          {(a) => (
            <Input
              {...a}
              value={v.slug}
              onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase() })}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
