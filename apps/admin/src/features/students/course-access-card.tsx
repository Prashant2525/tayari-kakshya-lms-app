import type { LocalizedText } from '@tk/contracts';
import { accessEndsAt } from '@tk/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardHeader, EmptyState, ErrorState, Spinner } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { nepalLocalToIso, type CourseDetail, type CourseRow, type CursorPage } from '@/lib/content';
import { formatDateBs, formatDateTimeBs, localized } from '@/lib/format';

interface Entitlement {
  id: string;
  course: { id: string; title: LocalizedText; slug: string } | null;
  sourceType: 'order' | 'admin_grant' | 'free_enrol' | 'coupon' | 'referral';
  startsAt: string;
  endsAt: string | null;
  status: 'active' | 'revoked' | 'expired';
  grantedBy: string | null;
  note: string | null;
  revokedReason: string | null;
  createdAt: string;
}

const SOURCE: Record<Entitlement['sourceType'], string> = {
  order: 'Purchase',
  admin_grant: 'Granted by staff',
  free_enrol: 'Free enrolment',
  coupon: 'Coupon',
  referral: 'Referral',
};

/** Expiry of a grant made now under the course's own validity setting. */
function courseValidityEnd(course: CourseDetail, now = new Date()): Date | null {
  const p = course.pricing;
  if (p.validityType === 'lifetime') return null;
  if (p.validityType === 'days') return accessEndsAt({ type: 'days', days: p.validityDays ?? 1 }, now);
  return accessEndsAt({ type: 'fixed_date', endsOn: p.validityEndsOn ?? '' }, now);
}

function GrantDialog({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const courses = useQuery({
    queryKey: ['courses', 'all'],
    queryFn: () => api.get<CursorPage<CourseRow>>('/admin/courses', { limit: 100 }),
  });
  const [courseId, setCourseId] = useState('');
  const course = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => api.get<CourseDetail>(`/admin/courses/${courseId}`),
    enabled: Boolean(courseId),
  });
  const [until, setUntil] = useState<'course' | 'date' | 'lifetime'>('course');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  let endsAt: string | null | undefined;
  if (until === 'lifetime') endsAt = null;
  else if (until === 'date') endsAt = date ? nepalLocalToIso(`${date}T23:59`) : undefined;
  else if (course.data) {
    try {
      endsAt = courseValidityEnd(course.data)?.toISOString() ?? null;
    } catch {
      endsAt = undefined;
    }
  }

  const grant = async () => {
    setError(null);
    if (!courseId) return setError('Choose a course');
    if (endsAt === undefined)
      return setError(
        until === 'date' ? 'Choose the last day of access' : 'The course has no valid validity setting',
      );
    setSaving(true);
    try {
      await api.post(`/admin/users/${studentId}/entitlements`, {
        courseId,
        endsAt,
        note: note.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ['entitlements', studentId] });
      toast.success('Access granted');
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
      onOpenChange={(o) => !o && onClose()}
      title="Grant course access"
      description="For offline payments, scholarships or support cases. Recorded in the audit log."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void grant()} loading={saving}>
            Grant access
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Course">
          {(a) => (
            <Select {...a} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">{courses.isPending ? 'Loading…' : 'Choose a course…'}</option>
              {(courses.data?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {localized(c.title)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Access until"
          hint={
            endsAt === null
              ? 'No end date.'
              : endsAt
                ? `Ends ${formatDateTimeBs(endsAt)} (Nepal time)`
                : until === 'course' && !courseId
                  ? 'Uses the validity set on the course.'
                  : undefined
          }
        >
          {(a) => (
            <Select {...a} value={until} onChange={(e) => setUntil(e.target.value as typeof until)}>
              <option value="course">The course's validity</option>
              <option value="date">A specific day</option>
              <option value="lifetime">Lifetime</option>
            </Select>
          )}
        </Field>
        {until === 'date' ? (
          <Field label="Last day of access">
            {(a) => <Input {...a} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        ) : null}
        <Field label="Note" hint="Why access was granted, e.g. a receipt number.">
          {(a) => <Textarea {...a} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

function RevokeDialog({
  entitlement,
  studentId,
  onClose,
}: {
  entitlement: Entitlement;
  studentId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const revoke = async () => {
    if (reason.trim().length < 3) return setError('Give a short reason (at least 3 characters)');
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/entitlements/${entitlement.id}/revoke`, { reason: reason.trim() });
      await qc.invalidateQueries({ queryKey: ['entitlements', studentId] });
      toast.success('Access revoked');
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
      onOpenChange={(o) => !o && onClose()}
      title={`Revoke access to ${entitlement.course ? localized(entitlement.course.title) : 'this course'}?`}
      description="The student loses access immediately. The record is kept."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void revoke()} loading={saving}>
            Revoke access
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3">
          <Alert tone="danger" title={error} />
        </div>
      ) : null}
      <Field label="Reason">
        {(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

export function CourseAccessCard({ studentId }: { studentId: string }) {
  const { can } = useAuth();
  const canGrant = can('entitlements:grant');
  const list = useQuery({
    queryKey: ['entitlements', studentId],
    queryFn: () => api.get<Entitlement[]>(`/admin/users/${studentId}/entitlements`),
  });
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<Entitlement | null>(null);
  return (
    <Card className="mt-4">
      <CardHeader
        title="Course access"
        description="Purchases, free enrolments and access granted by staff."
        actions={
          canGrant ? (
            <Button size="sm" onClick={() => setGranting(true)}>
              <Plus /> Grant access
            </Button>
          ) : undefined
        }
      />
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState
          title="No course access"
          description="The student has not bought, joined or been given any course yet."
        />
      ) : (
        <ul className="divide-y divide-border">
          {list.data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-text">
                  {e.course ? (
                    <Link
                      to="/courses/$courseId"
                      params={{ courseId: e.course.id }}
                      className="hover:text-link"
                    >
                      {localized(e.course.title)}
                    </Link>
                  ) : (
                    'Course'
                  )}
                </p>
                <p className="text-xs text-text-muted">
                  {SOURCE[e.sourceType]}
                  {e.grantedBy ? ` by ${e.grantedBy}` : ''} · from {formatDateBs(e.startsAt)} ·{' '}
                  {e.endsAt ? `until ${formatDateBs(e.endsAt)}` : 'no end date'}
                  {e.note ? ` · “${e.note}”` : ''}
                  {e.revokedReason ? ` · revoked: ${e.revokedReason}` : ''}
                </p>
              </div>
              <Badge tone={e.status === 'active' ? 'success' : e.status === 'revoked' ? 'danger' : 'neutral'}>
                {e.status === 'active' ? 'Active' : e.status === 'revoked' ? 'Revoked' : 'Expired'}
              </Badge>
              {canGrant && e.status === 'active' ? (
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRevoking(e)}>
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {granting ? <GrantDialog studentId={studentId} onClose={() => setGranting(false)} /> : null}
      {revoking ? (
        <RevokeDialog entitlement={revoking} studentId={studentId} onClose={() => setRevoking(null)} />
      ) : null}
    </Card>
  );
}
