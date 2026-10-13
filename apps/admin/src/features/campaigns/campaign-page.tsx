import type { CampaignAudience, LocalizedText, PublishStatus } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Bell, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckList } from '@/components/content/check-list';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardHeader, ErrorState, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import {
  isoToNepalLocal,
  nepalLocalToIso,
  toLocalized,
  type CourseRow,
  type CursorPage,
  type ExamNode,
} from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';
import { useNodeTypes } from '@/lib/node-types';
import { AUDIENCE_LABEL, CAMPAIGN_STATUS, type CampaignRow } from './campaigns-page';

type LinkType = '' | 'course' | 'article' | 'notice';
type Titled = { id: string; title: LocalizedText; status: PublishStatus };

/** A campaign: write it, choose who gets it, then send now or schedule it (D-075 / audit F-08). */
export function CampaignPage() {
  const { campaignId } = useParams({ from: '/app/campaigns/$campaignId' });
  const isNew = campaignId === 'new';
  const campaign = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api.get<CampaignRow>(`/admin/notification-campaigns/${campaignId}`),
    enabled: !isNew,
  });
  if (!isNew && campaign.isPending) return <Spinner />;
  if (!isNew && campaign.isError)
    return <ErrorState error={campaign.error} onRetry={() => void campaign.refetch()} />;
  const c = isNew ? null : campaign.data!;
  const editable = !c || c.status === 'draft' || c.status === 'scheduled';
  return (
    <>
      <Link
        to="/campaigns"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Campaigns
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
          {c ? 'Campaign' : 'New campaign'}
        </h1>
        {c ? <Badge tone={CAMPAIGN_STATUS[c.status].tone}>{CAMPAIGN_STATUS[c.status].label}</Badge> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <CampaignForm key={c ? c.updatedAt : 'new'} campaign={c} editable={editable} />
        {c ? <SendCard key={`s${c.updatedAt}`} campaign={c} /> : null}
      </div>
    </>
  );
}

function CampaignForm({ campaign: c, editable }: { campaign: CampaignRow | null; editable: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { label: typeLabel } = useNodeTypes();
  const [v, setV] = useState({
    titleEn: c?.title.en ?? '',
    titleNe: c?.title.ne ?? '',
    messageEn: c?.message.en ?? '',
    messageNe: c?.message.ne ?? '',
    audience: (c?.audience.type ?? 'all') as CampaignAudience['type'],
    courseIds: c?.audience.type === 'courses' ? c.audience.courseIds : [],
    examNodeIds: c?.audience.type === 'exam_nodes' ? c.audience.examNodeIds : [],
    linkType: (c?.link?.type ?? '') as LinkType,
    linkId: c?.link?.id ?? '',
    push: c?.push ?? true,
    email: c?.email ?? false,
    excludeIos: c?.excludeIos ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((x) => ({ ...x, [k]: value }));
  const toggle = (k: 'courseIds' | 'examNodeIds') => (id: string, on: boolean) =>
    setV((x) => ({ ...x, [k]: on ? [...x[k], id] : x[k].filter((i) => i !== id) }));

  const courses = useQuery({
    queryKey: ['courses', 'all'],
    queryFn: () => api.get<CursorPage<CourseRow>>('/admin/courses', { limit: 100 }),
  });
  const nodes = useQuery({
    queryKey: ['exam-nodes', { showDeleted: false }],
    queryFn: () => api.get<ExamNode[]>('/admin/exam-nodes'),
  });
  const linkables = useQuery({
    queryKey: ['campaign-links', v.linkType],
    queryFn: () =>
      v.linkType === 'course'
        ? api.get<CursorPage<Titled>>('/admin/courses', { status: 'published', limit: 100 })
        : api.get<CursorPage<Titled>>(`/admin/${v.linkType}s`, { status: 'published', limit: 100 }),
    enabled: v.linkType !== '',
  });
  const nodeItems = useMemo(() => {
    const byId = new Map((nodes.data ?? []).map((n) => [n.id, n]));
    const path = (n: ExamNode): string => {
      const parent = n.parentId ? byId.get(n.parentId) : undefined;
      return parent ? `${path(parent)} › ${localized(n.name)}` : localized(n.name);
    };
    return (nodes.data ?? [])
      .map((n) => ({ id: n.id, label: path(n), hint: typeLabel(n.nodeType) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [nodes.data, typeLabel]);

  const audience = (): CampaignAudience | null => {
    if (v.audience === 'courses')
      return v.courseIds.length ? { type: 'courses', courseIds: v.courseIds } : null;
    if (v.audience === 'exam_nodes')
      return v.examNodeIds.length ? { type: 'exam_nodes', examNodeIds: v.examNodeIds } : null;
    return { type: 'all' };
  };
  const target = audience();
  const reach = useQuery({
    queryKey: ['campaign-audience', target, v.excludeIos],
    queryFn: () =>
      api.post<{ recipients: number }>('/admin/notification-campaigns/audience', {
        audience: target,
        excludeIos: v.excludeIos,
      }),
    enabled: Boolean(target),
  });

  const submit = async () => {
    const title = toLocalized(v.titleEn, v.titleNe);
    const message = toLocalized(v.messageEn, v.messageNe);
    if (!title) return setError('Enter the title in English, Nepali or both');
    if (!message) return setError('Write the message in English, Nepali or both');
    if (!target) return setError('Choose at least one course or exam category');
    if (v.linkType && !v.linkId) return setError(`Choose the ${v.linkType} to open, or no link`);
    const payload = {
      title,
      message,
      audience: target,
      link: v.linkType ? { type: v.linkType, id: v.linkId } : null,
      push: v.push,
      email: v.email,
      excludeIos: v.excludeIos,
    };
    setSaving(true);
    setError(null);
    try {
      if (c) {
        const saved = await api.put<CampaignRow>(`/admin/notification-campaigns/${c.id}`, payload);
        qc.setQueryData(['campaign', c.id], saved);
        toast.success('Campaign saved');
      } else {
        const created = await api.post<CampaignRow>('/admin/notification-campaigns', payload);
        qc.setQueryData(['campaign', created.id], created);
        toast.success('Campaign saved as a draft');
        void navigate({ to: '/campaigns/$campaignId', params: { campaignId: created.id }, replace: true });
      }
      await qc.invalidateQueries({ queryKey: ['campaigns'] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const disabled = !editable;
  return (
    <Card className="min-w-0">
      <CardHeader
        title="Message"
        description="Plain text, as it appears in the app's notifications (and as the push and email)."
      />
      <div className="flex flex-col gap-5 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        {disabled ? (
          <Alert tone="primary" title="This campaign is no longer editable; it is kept as a record." />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title (English)" hint="Up to 120 characters.">
            {(a) => (
              <Input
                {...a}
                maxLength={120}
                value={v.titleEn}
                disabled={disabled}
                onChange={(e) => set('titleEn', e.target.value)}
              />
            )}
          </Field>
          <Field label="शीर्षक (नेपाली)">
            {(a) => (
              <Input
                {...a}
                lang="ne"
                maxLength={120}
                value={v.titleNe}
                disabled={disabled}
                onChange={(e) => set('titleNe', e.target.value)}
              />
            )}
          </Field>
          <Field label="Message (English)" hint="Up to 1,000 characters.">
            {(a) => (
              <Textarea
                {...a}
                rows={4}
                maxLength={1000}
                value={v.messageEn}
                disabled={disabled}
                onChange={(e) => set('messageEn', e.target.value)}
              />
            )}
          </Field>
          <Field label="सन्देश (नेपाली)">
            {(a) => (
              <Textarea
                {...a}
                lang="ne"
                rows={4}
                maxLength={1000}
                value={v.messageNe}
                disabled={disabled}
                onChange={(e) => set('messageNe', e.target.value)}
              />
            )}
          </Field>
        </div>

        <section aria-labelledby="audience-title" className="flex flex-col gap-3">
          <h3 id="audience-title" className="font-semibold text-text">
            Who gets it
          </h3>
          <Field label="Audience">
            {(a) => (
              <Select
                {...a}
                value={v.audience}
                disabled={disabled}
                onChange={(e) => set('audience', e.target.value as CampaignAudience['type'])}
              >
                {(Object.keys(AUDIENCE_LABEL) as Array<CampaignAudience['type']>).map((k) => (
                  <option key={k} value={k}>
                    {AUDIENCE_LABEL[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {v.audience === 'courses' ? (
            courses.isPending ? (
              <Spinner />
            ) : (
              <>
                <p className="text-xs text-text-muted">
                  Students who have access to any of these courses now.
                </p>
                <CheckList
                  items={(courses.data?.data ?? []).map((co) => ({ id: co.id, label: localized(co.title) }))}
                  selected={v.courseIds}
                  onToggle={toggle('courseIds')}
                  disabled={disabled}
                  empty="No courses yet."
                />
              </>
            )
          ) : null}
          {v.audience === 'exam_nodes' ? (
            nodes.isPending ? (
              <Spinner />
            ) : (
              <>
                <p className="text-xs text-text-muted">
                  Students whose “preparing for” choice is one of these, or anything under them.
                </p>
                <CheckList
                  items={nodeItems}
                  selected={v.examNodeIds}
                  onToggle={toggle('examNodeIds')}
                  disabled={disabled}
                  empty="No exam categories yet."
                />
              </>
            )
          ) : null}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-text">Leave out iPhone app users</p>
              <p className="text-xs text-text-muted">
                Turn on when the message is about buying: the iPhone app shows no prices or buying (D-027).
              </p>
            </div>
            <Switch
              checked={v.excludeIos}
              disabled={disabled}
              onCheckedChange={(x) => set('excludeIos', x)}
              label="Leave out iPhone app users"
            />
          </div>
          <p className="text-sm text-text-secondary" role="status">
            {!target
              ? 'Choose who gets it.'
              : reach.isPending
                ? 'Counting students…'
                : reach.isError
                  ? 'Could not count the students.'
                  : `${reach.data.recipients} student${reach.data.recipients === 1 ? '' : 's'} match now.`}
          </p>
        </section>

        <section aria-labelledby="channels-title" className="flex flex-col gap-3">
          <h3 id="channels-title" className="font-semibold text-text">
            How it reaches them
          </h3>
          <p className="text-xs text-text-muted">
            Always in the app's notifications. Students who turned off “Announcements” for push or email do
            not get those.
          </p>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-text">Push notification</p>
            <Switch
              checked={v.push}
              disabled={disabled}
              onCheckedChange={(x) => set('push', x)}
              label="Push notification"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-text">Email</p>
            <Switch
              checked={v.email}
              disabled={disabled}
              onCheckedChange={(x) => set('email', x)}
              label="Email"
            />
          </div>
        </section>

        <section aria-labelledby="link-title" className="flex flex-col gap-3">
          <h3 id="link-title" className="font-semibold text-text">
            When tapped, open
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Opens">
              {(a) => (
                <Select
                  {...a}
                  value={v.linkType}
                  disabled={disabled}
                  onChange={(e) => setV((x) => ({ ...x, linkType: e.target.value as LinkType, linkId: '' }))}
                >
                  <option value="">Nothing (just the message)</option>
                  <option value="course">A course</option>
                  <option value="article">An article</option>
                  <option value="notice">A notice</option>
                </Select>
              )}
            </Field>
            {v.linkType ? (
              <Field label={`Published ${v.linkType}`}>
                {(a) => (
                  <Select
                    {...a}
                    value={v.linkId}
                    disabled={disabled || linkables.isPending}
                    onChange={(e) => set('linkId', e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {(linkables.data?.data ?? []).map((x) => (
                      <option key={x.id} value={x.id}>
                        {localized(x.title)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
          </div>
        </section>

        <Preview title={toLocalized(v.titleEn, v.titleNe)} message={toLocalized(v.messageEn, v.messageNe)} />

        {editable ? (
          <div className="flex justify-end">
            <Button onClick={() => void submit()} loading={saving}>
              {c ? 'Save changes' : 'Save draft'}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** Roughly how the notification looks on a phone, in both languages. */
function Preview({ title, message }: { title: LocalizedText | null; message: LocalizedText | null }) {
  if (!title && !message) return null;
  return (
    <section aria-label="Preview" className="flex flex-col gap-2">
      <h3 className="font-semibold text-text">Preview</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['en', 'ne'] as const)
          .filter((l) => title?.[l] || message?.[l])
          .map((l) => (
            <div key={l} lang={l} className="flex gap-3 rounded-md border border-border bg-surface-muted p-3">
              <Bell className="mt-0.5 size-5 shrink-0 text-text-muted" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">{title?.[l] ?? title?.en ?? title?.ne}</p>
                <p className="line-clamp-3 text-sm text-text-secondary">
                  {message?.[l] ?? message?.en ?? message?.ne}
                </p>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}

function SendCard({ campaign: c }: { campaign: CampaignRow }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [when, setWhen] = useState(isoToNepalLocal(c.sendAt));
  const [confirm, setConfirm] = useState<'now' | 'schedule' | 'cancel' | 'delete' | null>(null);
  const refresh = async (next: CampaignRow) => {
    qc.setQueryData(['campaign', c.id], next);
    await qc.invalidateQueries({ queryKey: ['campaigns'] });
  };
  const send = async (sendAt: string | null) => {
    const next = await api.post<CampaignRow>(`/admin/notification-campaigns/${c.id}/send`, { sendAt });
    await refresh(next);
    toast.success(
      next.status === 'sent'
        ? `Sent to ${next.recipients} student${next.recipients === 1 ? '' : 's'}`
        : 'Campaign scheduled',
    );
  };
  const at = nepalLocalToIso(when);

  if (c.status === 'sent' || c.status === 'sending' || c.status === 'cancelled') {
    return (
      <Card>
        <CardHeader title="Sending" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-5 text-sm">
          <dt className="text-text-muted">Status</dt>
          <dd>{CAMPAIGN_STATUS[c.status].label}</dd>
          {c.sentAt ? (
            <>
              <dt className="text-text-muted">Sent</dt>
              <dd>{formatDateTimeBs(c.sentAt)}</dd>
              <dt className="text-text-muted">Students</dt>
              <dd>{c.recipients}</dd>
            </>
          ) : null}
          <dt className="text-text-muted">Written by</dt>
          <dd>{c.createdBy}</dd>
        </dl>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        title="Send"
        description={
          c.status === 'scheduled' && c.sendAt
            ? `Scheduled for ${formatDateTimeBs(c.sendAt)}.`
            : 'Save your changes first. Students get it once, whatever happens.'
        }
      />
      <div className="flex flex-col gap-4 p-5">
        <Button onClick={() => setConfirm('now')}>
          <Send /> Send now
        </Button>
        <Field label="Or send at (Nepal time)" hint={at ? formatDateTimeBs(at) : undefined}>
          {(a) => (
            <Input {...a} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          )}
        </Field>
        <Button variant="secondary" disabled={!at} onClick={() => setConfirm('schedule')}>
          {c.status === 'scheduled' ? 'Change the time' : 'Schedule'}
        </Button>
        {c.status === 'scheduled' ? (
          <Button variant="secondary" onClick={() => setConfirm('cancel')}>
            Cancel the campaign
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setConfirm('delete')}>
            Delete draft
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm === 'now'}
        onOpenChange={(o) => setConfirm(o ? 'now' : null)}
        title="Send this campaign now?"
        description="It goes to every student who matches the audience now. It cannot be taken back."
        confirmLabel="Send now"
        tone="primary"
        onConfirm={() => send(null)}
      />
      <ConfirmDialog
        open={confirm === 'schedule'}
        onOpenChange={(o) => setConfirm(o ? 'schedule' : null)}
        title="Schedule this campaign?"
        description={at ? `It goes out on ${formatDateTimeBs(at)} to the students who match then.` : ''}
        confirmLabel="Schedule"
        tone="primary"
        onConfirm={() => send(at)}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(o) => setConfirm(o ? 'cancel' : null)}
        title="Cancel this campaign?"
        description="It will not be sent. It stays in the list as cancelled."
        confirmLabel="Cancel campaign"
        tone="danger"
        onConfirm={async () => {
          await refresh(await api.post<CampaignRow>(`/admin/notification-campaigns/${c.id}/cancel`));
          toast.success('Campaign cancelled');
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => setConfirm(o ? 'delete' : null)}
        title="Delete this draft?"
        description="Drafts that were never sent can be deleted."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          await api.delete(`/admin/notification-campaigns/${c.id}`);
          await qc.invalidateQueries({ queryKey: ['campaigns'] });
          toast.success('Draft deleted');
          void navigate({ to: '/campaigns' });
        }}
      />
    </Card>
  );
}
