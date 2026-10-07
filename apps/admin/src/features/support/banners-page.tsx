import type { LocalizedText } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { MediaField } from '@/components/content/media-picker';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  Switch,
} from '@/components/ui/primitives';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { isoToNepalLocal, nepalLocalToIso, toLocalized } from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';

const PLACEMENT = { both: 'App and website', app: 'App Home only', website: 'Website home only' } as const;
type Placement = keyof typeof PLACEMENT;

const LINK = {
  none: 'No link',
  course: 'A course',
  plan: 'A plan (not shown on iPhone)',
  article: 'An article',
  page: 'A page (About, Terms…)',
  url: 'A web address (not shown on iPhone)',
} as const;
type LinkType = keyof typeof LINK;

const LINK_HINT: Record<LinkType, string> = {
  none: '',
  course: "The course's web address, e.g. kharidar-complete",
  plan: "The plan's web address, e.g. all-courses-1-year",
  article: "The article's web address",
  page: 'about, terms, privacy or refund',
  url: 'An https:// link',
};

interface BannerRow {
  id: string;
  title: LocalizedText;
  imageMediaId: string;
  image: { url: string; variants: Record<string, string> } | null;
  linkType: LinkType;
  linkValue: string;
  placement: Placement;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  active: boolean;
  hideOnIos: boolean;
}

/** Promotional banners (D-064) on the app's Home and the website's home page. */
export function BannersPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['banners'],
    queryFn: ({ signal }) => api.get<BannerRow[]>('/admin/banners', undefined, signal),
  });
  const [editing, setEditing] = useState<BannerRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<BannerRow | null>(null);
  // When the page opened (a render must not read the clock).
  const [now] = useState(() => Date.now());
  const state = (b: BannerRow) =>
    !b.active
      ? 'Switched off'
      : b.startsAt && Date.parse(b.startsAt) > now
        ? `Starts ${formatDateTimeBs(b.startsAt)}`
        : b.endsAt && Date.parse(b.endsAt) <= now
          ? 'Ended'
          : 'Showing';
  return (
    <>
      <PageHeader
        title="Banners"
        description="Pictures at the top of the app's Home and the website's home page, in order. Use wide pictures (about 1600 × 700). On iPhone, banners linking to plans or web addresses, and those marked so, are not shown (Apple's rules)."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New banner
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
            title="No banners yet"
            description="Add one to promote a course, an article or an offer."
          />
        ) : (
          <ul className="divide-y divide-border">
            {list.data.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                {b.image ? (
                  <img
                    src={b.image.variants['w320'] ?? b.image.url}
                    alt=""
                    className="h-16 w-36 rounded-sm object-cover"
                  />
                ) : (
                  <div className="h-16 w-36 rounded-sm bg-surface-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{localized(b.title)}</p>
                  <p className="text-sm text-text-muted">
                    {PLACEMENT[b.placement]} ·{' '}
                    {b.linkType === 'none' ? 'No link' : `${b.linkType}: ${b.linkValue}`}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={state(b) === 'Showing' ? 'success' : 'neutral'}>{state(b)}</Badge>
                    {b.hideOnIos || b.linkType === 'plan' || b.linkType === 'url' ? (
                      <Badge tone="primary">Not on iPhone</Badge>
                    ) : null}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Edit ${localized(b.title)}`}
                  onClick={() => setEditing(b)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${localized(b.title)}`}
                  onClick={() => setRemoving(b)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing ? (
        <BannerDialog
          banner={editing === 'new' ? null : editing}
          nextOrder={(list.data?.at(-1)?.sortOrder ?? 0) + 1}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this banner?"
        description={removing ? localized(removing.title) : ''}
        confirmLabel="Delete"
        onConfirm={async () => {
          await api.delete(`/admin/banners/${removing!.id}`);
          await qc.invalidateQueries({ queryKey: ['banners'] });
          toast.success('Banner deleted');
        }}
      />
    </>
  );
}

function BannerDialog({
  banner,
  nextOrder,
  onClose,
}: {
  banner: BannerRow | null;
  nextOrder: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [v, setV] = useState({
    titleEn: banner?.title.en ?? '',
    titleNe: banner?.title.ne ?? '',
    imageMediaId: banner?.imageMediaId ?? null,
    linkType: banner?.linkType ?? ('none' as LinkType),
    linkValue: banner?.linkValue ?? '',
    placement: banner?.placement ?? ('both' as Placement),
    startsAt: isoToNepalLocal(banner?.startsAt ?? null),
    endsAt: isoToNepalLocal(banner?.endsAt ?? null),
    sortOrder: banner?.sortOrder ?? nextOrder,
    active: banner?.active ?? true,
    hideOnIos: banner?.hideOnIos ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const title = toLocalized(v.titleEn, v.titleNe);
    if (!title)
      return setError(
        'Enter a title in English, Nepali or both (it is read aloud and shown with the picture)',
      );
    if (!v.imageMediaId) return setError('Choose a picture');
    setSaving(true);
    setError(null);
    setProblems({});
    try {
      const body = {
        title,
        imageMediaId: v.imageMediaId,
        linkType: v.linkType,
        linkValue: v.linkType === 'none' ? '' : v.linkValue.trim(),
        placement: v.placement,
        startsAt: v.startsAt ? nepalLocalToIso(v.startsAt) : null,
        endsAt: v.endsAt ? nepalLocalToIso(v.endsAt) : null,
        sortOrder: v.sortOrder,
        active: v.active,
        hideOnIos: v.hideOnIos,
      };
      if (banner) await api.put(`/admin/banners/${banner.id}`, body);
      else await api.post('/admin/banners', body);
      await qc.invalidateQueries({ queryKey: ['banners'] });
      toast.success('Banner saved');
      onClose();
    } catch (err) {
      setProblems(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={banner ? 'Edit banner' : 'New banner'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <MediaField
          kind="image"
          label="Picture"
          value={v.imageMediaId}
          onChange={(id) => setV({ ...v, imageMediaId: id })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title (English)">
            {(a) => (
              <Input
                {...a}
                maxLength={120}
                value={v.titleEn}
                onChange={(e) => setV({ ...v, titleEn: e.target.value })}
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
                onChange={(e) => setV({ ...v, titleNe: e.target.value })}
              />
            )}
          </Field>
          <Field label="Opens">
            {(a) => (
              <Select
                {...a}
                value={v.linkType}
                onChange={(e) => setV({ ...v, linkType: e.target.value as LinkType, linkValue: '' })}
              >
                {(Object.keys(LINK) as LinkType[]).map((k) => (
                  <option key={k} value={k}>
                    {LINK[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {v.linkType !== 'none' ? (
            <Field label="Link" hint={LINK_HINT[v.linkType]} error={problems['linkValue']}>
              {(a) => (
                <Input
                  {...a}
                  maxLength={500}
                  value={v.linkValue}
                  onChange={(e) => setV({ ...v, linkValue: e.target.value })}
                />
              )}
            </Field>
          ) : (
            <div />
          )}
          <Field label="Shown on">
            {(a) => (
              <Select
                {...a}
                value={v.placement}
                onChange={(e) => setV({ ...v, placement: e.target.value as Placement })}
              >
                {(Object.keys(PLACEMENT) as Placement[]).map((k) => (
                  <option key={k} value={k}>
                    {PLACEMENT[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Order">
            {(a) => (
              <Input
                {...a}
                type="number"
                min={0}
                value={v.sortOrder}
                onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) || 0 })}
              />
            )}
          </Field>
          <Field
            label="Starts (Nepal time)"
            hint={v.startsAt ? formatDateTimeBs(nepalLocalToIso(v.startsAt)) : 'Empty = now'}
          >
            {(a) => (
              <Input
                {...a}
                type="datetime-local"
                value={v.startsAt}
                onChange={(e) => setV({ ...v, startsAt: e.target.value })}
              />
            )}
          </Field>
          <Field
            label="Ends (Nepal time)"
            hint={v.endsAt ? formatDateTimeBs(nepalLocalToIso(v.endsAt)) : 'Empty = until switched off'}
            error={problems['endsAt']}
          >
            {(a) => (
              <Input
                {...a}
                type="datetime-local"
                value={v.endsAt}
                onChange={(e) => setV({ ...v, endsAt: e.target.value })}
              />
            )}
          </Field>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">Showing</span>
          <Switch checked={v.active} onCheckedChange={(x) => setV({ ...v, active: x })} label="Showing" />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">
            Hide in the iPhone app (the picture shows prices, discounts or buying)
          </span>
          <Switch
            checked={v.hideOnIos}
            onCheckedChange={(x) => setV({ ...v, hideOnIos: x })}
            label="Hide in the iPhone app"
          />
        </div>
      </div>
    </Dialog>
  );
}
