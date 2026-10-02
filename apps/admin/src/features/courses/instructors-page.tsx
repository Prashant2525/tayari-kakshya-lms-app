import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { MediaField } from '@/components/content/media-picker';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import {
  Alert,
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  Switch,
} from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { toLocalized, type InstructorRow } from '@/lib/content';
import { localized } from '@/lib/format';

function ProfileDialog({ row, onClose }: { row: InstructorRow; onClose: () => void }) {
  const qc = useQueryClient();
  const p = row.profile;
  const [v, setV] = useState({
    nameEn: p?.displayName.en ?? (p ? '' : row.fullName),
    nameNe: p?.displayName.ne ?? '',
    bioEn: p?.bio?.en ?? '',
    bioNe: p?.bio?.ne ?? '',
    photoMediaId: p?.photoMediaId ?? null,
    isPublic: p?.isPublic ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) =>
    setV((x) => ({ ...x, [key]: value }));
  const save = async () => {
    const displayName = toLocalized(v.nameEn, v.nameNe);
    if (!displayName) return setError('Enter the name shown to students');
    setSaving(true);
    setError(null);
    try {
      await api.put(`/admin/instructors/${row.userId}`, {
        displayName,
        bio: toLocalized(v.bioEn, v.bioNe),
        photoMediaId: v.photoMediaId,
        isPublic: v.isPublic,
      });
      await qc.invalidateQueries({ queryKey: ['instructors'] });
      toast.success('Profile saved');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={`Instructor profile: ${row.fullName}`}
      description="Shown on course pages that list this person as an instructor."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name (English)">
            {(a) => <Input {...a} value={v.nameEn} onChange={(e) => set('nameEn', e.target.value)} />}
          </Field>
          <Field label="नाम (नेपाली)">
            {(a) => (
              <Input {...a} lang="ne" value={v.nameNe} onChange={(e) => set('nameNe', e.target.value)} />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bio (English)">
            {(a) => (
              <Textarea {...a} rows={4} value={v.bioEn} onChange={(e) => set('bioEn', e.target.value)} />
            )}
          </Field>
          <Field label="परिचय (नेपाली)">
            {(a) => (
              <Textarea
                {...a}
                rows={4}
                lang="ne"
                value={v.bioNe}
                onChange={(e) => set('bioNe', e.target.value)}
              />
            )}
          </Field>
        </div>
        <MediaField
          kind="image"
          label="Photo"
          value={v.photoMediaId}
          onChange={(id) => set('photoMediaId', id)}
        />
        <div className="flex items-center justify-between rounded-sm border border-border p-3">
          <div>
            <p className="text-sm font-semibold text-text">Show to students</p>
            <p className="text-xs text-text-muted">
              Hidden profiles stay attached to courses but are not displayed.
            </p>
          </div>
          <Switch checked={v.isPublic} onCheckedChange={(x) => set('isPublic', x)} label="Show to students" />
        </div>
      </div>
    </Dialog>
  );
}

export function InstructorsPage() {
  const list = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get<InstructorRow[]>('/admin/instructors'),
  });
  const [editing, setEditing] = useState<InstructorRow | null>(null);
  return (
    <>
      <PageHeader
        title="Instructors"
        description="Public profiles for staff who teach. Add a profile, then link the instructor to courses."
      />
      <Card>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState
            title="No staff yet"
            description="Invite staff first; any staff member can have an instructor profile."
          />
        ) : (
          <ul className="divide-y divide-border">
            {list.data.map((row) => (
              <li key={row.userId} className="flex items-center gap-3 px-5 py-3">
                {row.profile?.photoUrl ? (
                  <img src={row.profile.photoUrl} alt="" className="size-10 rounded-full object-cover" />
                ) : (
                  <Avatar name={row.fullName} className="size-10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-text">
                    {row.profile ? localized(row.profile.displayName) : row.fullName}
                  </p>
                  <p className="truncate text-xs text-text-muted">{row.email}</p>
                </div>
                {row.profile ? (
                  row.profile.isPublic ? (
                    <Badge tone="success">Public</Badge>
                  ) : (
                    <Badge>Hidden</Badge>
                  )
                ) : (
                  <Badge>No profile</Badge>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(row)}
                  aria-label={`Edit profile of ${row.fullName}`}
                >
                  <Pencil /> {row.profile ? 'Edit' : 'Create profile'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing ? <ProfileDialog row={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
