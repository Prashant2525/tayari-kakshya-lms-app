import type { AccessLevel, LiveProvider } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Card, CardHeader, EmptyState, ErrorState, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { isoToNepalLocal, nepalLocalToIso, toLocalized, type InstructorRow } from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';
import { LiveStatusBadge, PROVIDER_LABEL, useCourseOptions, type LiveClassRow } from './live-classes-page';

/** One live class (D-072): its details, running it (publish → live → ended), the recording and who joined. */
export function LiveClassPage() {
  const { liveClassId } = useParams({ from: '/app/live-classes/$liveClassId' });
  const isNew = liveClassId === 'new';
  const live = useQuery({
    queryKey: ['live-class', liveClassId],
    queryFn: () => api.get<LiveClassRow>(`/admin/live-classes/${liveClassId}`),
    enabled: !isNew,
  });
  if (!isNew && live.isPending) return <Spinner />;
  if (!isNew && live.isError) return <ErrorState error={live.error} onRetry={() => void live.refetch()} />;
  const l = isNew ? null : live.data!;
  return (
    <>
      <Link
        to="/live-classes"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Live classes
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
          {l ? localized(l.title) : 'New live class'}
        </h1>
        {l ? <LiveStatusBadge live={l} /> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <LiveClassForm key={l ? `${l.id}${l.status}${l.startsAt}` : 'new'} live={l} />
          {l && l.published ? <AttendanceCard live={l} /> : null}
        </div>
        {l ? (
          <div className="flex flex-col gap-6">
            <RunCard live={l} />
            {l.status === 'live' || l.status === 'ended' ? (
              <RecordingCard key={`r${l.recording?.videoId}`} live={l} />
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

function LiveClassForm({ live: l }: { live: LiveClassRow | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const courses = useCourseOptions();
  const instructors = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get<InstructorRow[]>('/admin/instructors'),
  });
  const closed = l?.status === 'ended' || l?.status === 'cancelled';
  const [v, setV] = useState({
    courseId: l?.course.id ?? '',
    titleEn: l?.title.en ?? '',
    titleNe: l?.title.ne ?? '',
    descriptionEn: l?.description?.en ?? '',
    descriptionNe: l?.description?.ne ?? '',
    provider: l?.provider ?? ('youtube' as LiveProvider),
    joinUrl: l?.joinUrl ?? '',
    passcode: l?.passcode ?? '',
    startsAt: isoToNepalLocal(l?.startsAt ?? null),
    durationMinutes: String(l?.durationMinutes ?? 60),
    accessLevel: l?.accessLevel ?? ('premium' as AccessLevel),
    instructorId: l?.instructorId ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((x) => ({ ...x, [k]: value }));

  const submit = async () => {
    const e: Record<string, string> = {};
    const title = toLocalized(v.titleEn, v.titleNe);
    const startsAt = nepalLocalToIso(v.startsAt);
    const duration = Number(v.durationMinutes);
    if (!v.courseId) e.courseId = 'Choose the course';
    if (!title) e['title'] = 'Enter the title in English, Nepali or both';
    if (!v.joinUrl.trim()) e.joinUrl = 'Paste the link of the class';
    if (!startsAt) e.startsAt = 'Choose the date and time';
    if (!Number.isInteger(duration) || duration < 5 || duration > 600) e.durationMinutes = '5 to 600 minutes';
    setErrors(e);
    if (Object.keys(e).length) return setError('Check the highlighted fields');
    const payload = {
      courseId: v.courseId,
      title,
      description: toLocalized(v.descriptionEn, v.descriptionNe),
      provider: v.provider,
      joinUrl: v.joinUrl.trim(),
      passcode: v.provider === 'zoom' && v.passcode.trim() ? v.passcode.trim() : null,
      startsAt,
      durationMinutes: duration,
      accessLevel: v.accessLevel,
      instructorId: v.instructorId || null,
    };
    setSaving(true);
    setError(null);
    try {
      if (l) {
        await api.put(`/admin/live-classes/${l.id}`, payload);
        await qc.invalidateQueries({ queryKey: ['live-class', l.id] });
        toast.success(l.published ? 'Saved. Students are told if the time changed.' : 'Saved');
      } else {
        const created = await api.post<{ id: string }>('/admin/live-classes', payload);
        toast.success('Live class created as a draft');
        void navigate({ to: '/live-classes/$liveClassId', params: { liveClassId: created.id } });
      }
      await qc.invalidateQueries({ queryKey: ['live-classes'] });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Class"
        description="Students see the title, time, teacher and description. The link is only given to students who may join, when they join."
      />
      <div className="flex flex-col gap-5 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        {closed ? (
          <Alert tone="warning" title="This class has ended or was cancelled, so it can't be changed." />
        ) : null}
        <Field label="Course" error={errors.courseId}>
          {(a) => (
            <Select
              {...a}
              value={v.courseId}
              disabled={closed}
              onChange={(e) => set('courseId', e.target.value)}
            >
              <option value="">Choose a course</option>
              {(courses.data?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {localized(c.title)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title (English)" error={errors['title']}>
            {(a) => (
              <Input
                {...a}
                value={v.titleEn}
                disabled={closed}
                onChange={(e) => set('titleEn', e.target.value)}
              />
            )}
          </Field>
          <Field label="शीर्षक (नेपाली)">
            {(a) => (
              <Input
                {...a}
                lang="ne"
                value={v.titleNe}
                disabled={closed}
                onChange={(e) => set('titleNe', e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What the class covers (English)" hint="Optional">
            {(a) => (
              <Textarea
                {...a}
                rows={3}
                value={v.descriptionEn}
                disabled={closed}
                onChange={(e) => set('descriptionEn', e.target.value)}
              />
            )}
          </Field>
          <Field label="विवरण (नेपाली)" hint="Optional">
            {(a) => (
              <Textarea
                {...a}
                lang="ne"
                rows={3}
                value={v.descriptionNe}
                disabled={closed}
                onChange={(e) => set('descriptionNe', e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Where it runs">
            {(a) => (
              <Select
                {...a}
                value={v.provider}
                disabled={closed}
                onChange={(e) => set('provider', e.target.value as LiveProvider)}
              >
                {(Object.keys(PROVIDER_LABEL) as LiveProvider[]).map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABEL[p]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Who can join"
            hint={
              v.accessLevel === 'free'
                ? 'Any signed-in student'
                : 'Students with access to the course (purchase, plan or grant)'
            }
          >
            {(a) => (
              <Select
                {...a}
                value={v.accessLevel}
                disabled={closed}
                onChange={(e) => set('accessLevel', e.target.value as AccessLevel)}
              >
                <option value="premium">Premium</option>
                <option value="free">Free</option>
              </Select>
            )}
          </Field>
        </div>
        <Field
          label={v.provider === 'youtube' ? 'YouTube Live link' : 'Zoom meeting link'}
          hint={
            v.provider === 'youtube'
              ? 'Schedule the stream as Unlisted on YouTube and paste its link. Students watch it inside the app.'
              : 'The join link of the Zoom meeting. Students open it in the Zoom app.'
          }
          error={errors.joinUrl}
        >
          {(a) => (
            <Input
              {...a}
              type="url"
              placeholder={v.provider === 'youtube' ? 'https://youtube.com/live/…' : 'https://zoom.us/j/…'}
              value={v.joinUrl}
              disabled={closed}
              onChange={(e) => set('joinUrl', e.target.value)}
            />
          )}
        </Field>
        {v.provider === 'zoom' ? (
          <Field
            label="Meeting passcode"
            hint="Optional. Shown to students when they join."
            error={errors.passcode}
          >
            {(a) => (
              <Input
                {...a}
                className="w-64"
                value={v.passcode}
                disabled={closed}
                onChange={(e) => set('passcode', e.target.value)}
              />
            )}
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Starts at (Nepal time)"
            hint={v.startsAt ? formatDateTimeBs(nepalLocalToIso(v.startsAt)) : undefined}
            error={errors.startsAt}
          >
            {(a) => (
              <Input
                {...a}
                type="datetime-local"
                value={v.startsAt}
                disabled={closed}
                onChange={(e) => set('startsAt', e.target.value)}
              />
            )}
          </Field>
          <Field label="Length (minutes)" error={errors.durationMinutes}>
            {(a) => (
              <Input
                {...a}
                type="number"
                min={5}
                max={600}
                value={v.durationMinutes}
                disabled={closed}
                onChange={(e) => set('durationMinutes', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Teacher" hint="Optional. Staff with an instructor profile." error={errors.instructorId}>
          {(a) => (
            <Select
              {...a}
              value={v.instructorId}
              disabled={closed}
              onChange={(e) => set('instructorId', e.target.value)}
            >
              <option value="">No teacher shown</option>
              {(instructors.data ?? []).map((i) => (
                <option key={i.userId} value={i.userId}>
                  {i.profile ? localized(i.profile.displayName) : i.fullName}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-4">
        <Button onClick={() => void submit()} loading={saving} disabled={closed}>
          {l ? 'Save' : 'Create live class'}
        </Button>
      </div>
    </Card>
  );
}

type Action = 'publish' | 'start' | 'end' | 'cancel';
const ACTION_DONE: Record<Action, string> = {
  publish: 'Published. Students of the course are told.',
  start: 'The class is live. Students are told.',
  end: 'The class has ended',
  cancel: 'Cancelled. Students who were told are told it is off.',
};

/** Running the class. The worker also starts it at its time and ends it after its length (D-072). */
function RunCard({ live: l }: { live: LiveClassRow }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<Action | null>(null);
  const [confirm, setConfirm] = useState<Action | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: Action) => {
    setBusy(action);
    setError(null);
    try {
      await api.post(`/admin/live-classes/${l.id}/${action}`);
      await qc.invalidateQueries({ queryKey: ['live-class', l.id] });
      await qc.invalidateQueries({ queryKey: ['live-classes'] });
      toast.success(ACTION_DONE[action]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const draft = l.status === 'scheduled' && !l.published;
  const scheduled = l.status === 'scheduled' && l.published;
  return (
    <Card>
      <CardHeader title="Run the class" description={<LiveStatusBadge live={l} />} />
      <div className="flex flex-col gap-3 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-text-muted">Starts</dt>
          <dd>{formatDateTimeBs(l.startsAt)}</dd>
          <dt className="text-text-muted">Ends</dt>
          <dd>{formatDateTimeBs(l.endsAt)}</dd>
          {l.publishedAt ? (
            <>
              <dt className="text-text-muted">Published</dt>
              <dd>{formatDateTimeBs(l.publishedAt)}</dd>
            </>
          ) : null}
          {l.startedAt ? (
            <>
              <dt className="text-text-muted">Went live</dt>
              <dd>{formatDateTimeBs(l.startedAt)}</dd>
            </>
          ) : null}
          {l.endedAt ? (
            <>
              <dt className="text-text-muted">Ended</dt>
              <dd>{formatDateTimeBs(l.endedAt)}</dd>
            </>
          ) : null}
          {l.cancelledAt ? (
            <>
              <dt className="text-text-muted">Cancelled</dt>
              <dd>{formatDateTimeBs(l.cancelledAt)}</dd>
            </>
          ) : null}
        </dl>
        {draft ? (
          <>
            <p className="text-xs text-text-muted">
              A draft is hidden from students. Publishing shows it in the app and notifies the students who
              can join.
            </p>
            <Button onClick={() => setConfirm('publish')} loading={busy === 'publish'}>
              Publish and notify
            </Button>
          </>
        ) : null}
        {scheduled ? (
          <>
            <p className="text-xs text-text-muted">
              It goes live by itself at the start time; students can join a few minutes before.
            </p>
            <Button onClick={() => setConfirm('start')} loading={busy === 'start'}>
              Go live now
            </Button>
          </>
        ) : null}
        {l.status === 'live' ? (
          <>
            <p className="text-xs text-text-muted">It ends by itself a little after its length.</p>
            <Button onClick={() => setConfirm('end')} loading={busy === 'end'}>
              End the class
            </Button>
          </>
        ) : null}
        {l.status === 'scheduled' ? (
          <Button variant="secondary" onClick={() => setConfirm('cancel')} loading={busy === 'cancel'}>
            Cancel the class
          </Button>
        ) : null}
        {l.status !== 'live' ? (
          <Button variant="secondary" onClick={() => setConfirm('delete')}>
            Delete
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm !== null && confirm !== 'delete'}
        onOpenChange={(o) => (o ? null : setConfirm(null))}
        title={
          confirm === 'publish'
            ? 'Publish this class?'
            : confirm === 'start'
              ? 'Go live now?'
              : confirm === 'end'
                ? 'End this class?'
                : 'Cancel this class?'
        }
        description={
          confirm === 'publish'
            ? 'Students who can join get a notification now, a reminder before it starts and another when it goes live.'
            : confirm === 'start'
              ? 'Students can join straight away and are told it is live.'
              : confirm === 'end'
                ? 'Students can no longer join. You can add the recording afterwards.'
                : l.published
                  ? 'Students who were told about it get a notification that it is cancelled.'
                  : 'It is a draft, so nobody is told.'
        }
        confirmLabel={
          confirm === 'publish'
            ? 'Publish'
            : confirm === 'start'
              ? 'Go live'
              : confirm === 'end'
                ? 'End'
                : 'Cancel class'
        }
        tone={confirm === 'cancel' || confirm === 'end' ? 'danger' : 'primary'}
        onConfirm={async () => {
          if (confirm && confirm !== 'delete') await run(confirm);
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => (o ? null : setConfirm(null))}
        title="Delete this class?"
        description="It disappears from the app and the list. Notifications already sent are not taken back; attendance is kept."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          await api.delete(`/admin/live-classes/${l.id}`);
          await qc.invalidateQueries({ queryKey: ['live-classes'] });
          toast.success('Live class deleted');
          void navigate({ to: '/live-classes' });
        }}
      />
    </Card>
  );
}

/** The recording students can watch after the class (D-072): a YouTube or Bunny video. */
function RecordingCard({ live: l }: { live: LiveClassRow }) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState<'youtube' | 'bunny'>(l.recording?.provider ?? 'youtube');
  const [value, setValue] = useState(
    l.recording
      ? l.recording.provider === 'youtube'
        ? `https://youtu.be/${l.recording.videoId}`
        : l.recording.videoId
      : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (remove = false) => {
    if (!remove && !value.trim())
      return setError(provider === 'youtube' ? 'Paste the YouTube link' : 'Enter the Bunny video ID');
    setSaving(true);
    setError(null);
    try {
      await api.put(`/admin/live-classes/${l.id}/recording`, {
        recording: remove
          ? null
          : provider === 'youtube'
            ? { provider, url: value.trim() }
            : { provider, videoId: value.trim() },
      });
      await qc.invalidateQueries({ queryKey: ['live-class', l.id] });
      await qc.invalidateQueries({ queryKey: ['live-classes'] });
      toast.success(remove ? 'Recording removed' : 'Recording saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title="Recording"
        description="Students who could join the class can watch it in the app afterwards."
      />
      <div className="flex flex-col gap-3 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Video">
          {(a) => (
            <Select {...a} value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
              <option value="youtube">YouTube (unlisted)</option>
              <option value="bunny">Bunny Stream</option>
            </Select>
          )}
        </Field>
        <Field label={provider === 'youtube' ? 'YouTube link' : 'Bunny video ID'}>
          {(a) => <Input {...a} value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
        <Button onClick={() => void save()} loading={saving}>
          Save recording
        </Button>
        {l.recording ? (
          <Button variant="secondary" onClick={() => void save(true)} disabled={saving}>
            Remove recording
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

interface AttendanceRow {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  firstJoinedAt: string;
  lastJoinedAt: string;
  joins: number;
}

/** Who joined (D-072): recorded when a student taps Join. */
function AttendanceCard({ live: l }: { live: LiveClassRow }) {
  const attendance = useQuery({
    queryKey: ['live-class', l.id, 'attendance'],
    queryFn: () =>
      api.get<{ total: number; data: AttendanceRow[] }>(`/admin/live-classes/${l.id}/attendance`),
  });
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      await api.download(`/admin/live-classes/${l.id}/attendance.csv`, `live-attendance-${l.id}.csv`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title="Attendance"
        description={
          attendance.data ? `${attendance.data.total} joined. Recorded when a student taps Join.` : undefined
        }
        actions={
          attendance.data?.total ? (
            <Button variant="secondary" size="sm" loading={downloading} onClick={() => void download()}>
              <Download /> CSV
            </Button>
          ) : null
        }
      />
      {attendance.isPending ? (
        <Spinner />
      ) : attendance.isError ? (
        <ErrorState error={attendance.error} onRetry={() => void attendance.refetch()} />
      ) : attendance.data.data.length === 0 ? (
        <EmptyState
          title="Nobody has joined yet"
          description="Students appear here when they join the class."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Student</TH>
              <TH>First joined</TH>
              <TH>Joins</TH>
            </TR>
          </THead>
          <TBody>
            {attendance.data.data.map((r) => (
              <TR key={r.userId}>
                <TD>
                  <span className="font-medium">{r.name}</span>
                  <p className="text-xs text-text-muted">{r.email ?? r.phone}</p>
                </TD>
                <TD className="whitespace-nowrap text-sm">{formatDateTimeBs(r.firstJoinedAt)}</TD>
                <TD className="text-sm tabular-nums">{r.joins}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
