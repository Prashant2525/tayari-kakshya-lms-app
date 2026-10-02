import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, Checkbox, Spinner } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import type { CourseRow, CursorPage, SubjectRow } from '@/lib/content';
import { localized } from '@/lib/format';

type Scope = { scopeType: 'course' | 'subject'; scopeId: string };

/**
 * Limits a staff member (typically an instructor) to chosen courses and subjects. No limits = they can work on all
 * content their role allows. Enforced on the server.
 */
export function ScopesDialog({
  member,
  onClose,
}: {
  member: { id: string; fullName: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const current = useQuery({
    queryKey: ['staff-scopes', member.id],
    queryFn: () => api.get<Scope[]>(`/admin/staff/${member.id}/scopes`),
  });
  const courses = useQuery({
    queryKey: ['courses', 'all'],
    queryFn: () => api.get<CursorPage<CourseRow>>('/admin/courses', { limit: 100 }),
  });
  const subjects = useQuery({
    queryKey: ['subjects', 'all'],
    queryFn: () => api.get<CursorPage<SubjectRow>>('/admin/subjects', { limit: 100 }),
  });
  const [picked, setPicked] = useState<Scope[] | null>(null);
  const value = picked ?? current.data ?? [];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const has = (s: Scope) => value.some((v) => v.scopeType === s.scopeType && v.scopeId === s.scopeId);
  const toggle = (s: Scope, on: boolean) =>
    setPicked(
      on ? [...value, s] : value.filter((v) => !(v.scopeType === s.scopeType && v.scopeId === s.scopeId)),
    );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/admin/staff/${member.id}/scopes`, { scopes: value });
      await qc.invalidateQueries({ queryKey: ['staff-scopes', member.id] });
      toast.success(value.length ? 'Content access limited' : 'Content limits removed');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const list = (type: Scope['scopeType'], items: Array<{ id: string; label: string }>) => (
    <ul className="max-h-56 overflow-y-auto">
      {items.map((i) => {
        const id = `scope-${type}-${i.id}`;
        return (
          <li key={i.id} className="flex items-center gap-2 py-1.5">
            <Checkbox
              id={id}
              checked={has({ scopeType: type, scopeId: i.id })}
              onCheckedChange={(on) => toggle({ scopeType: type, scopeId: i.id }, on)}
            />
            <label htmlFor={id} className="text-sm text-text">
              {i.label}
            </label>
          </li>
        );
      })}
      {items.length === 0 ? <li className="py-1.5 text-sm text-text-muted">None yet.</li> : null}
    </ul>
  );

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={`Content access for ${member.fullName}`}
      description="Tick courses or subjects to limit what this person can edit. Leave everything unticked for no limit."
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
      {error ? (
        <div className="mb-3">
          <Alert tone="danger" title={error} />
        </div>
      ) : null}
      {current.isPending || courses.isPending || subjects.isPending ? (
        <Spinner />
      ) : courses.isError || subjects.isError ? (
        <Alert tone="warning" title="You need course and content permissions to choose limits." />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <section>
            <h3 className="mb-2 font-semibold text-text">Courses</h3>
            <p className="mb-2 text-xs text-text-muted">Includes every subject in the course.</p>
            {list(
              'course',
              (courses.data?.data ?? []).map((c) => ({ id: c.id, label: localized(c.title) })),
            )}
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-text">Subjects</h3>
            <p className="mb-2 text-xs text-text-muted">Chapters, topics and items inside them.</p>
            {list(
              'subject',
              (subjects.data?.data ?? []).map((s) => ({ id: s.id, label: localized(s.name) })),
            )}
          </section>
        </div>
      )}
      <p className="mt-4 text-xs text-text-muted">
        {value.length ? `${value.length} selected — this person is limited.` : 'No limits selected.'}
      </p>
    </Dialog>
  );
}
