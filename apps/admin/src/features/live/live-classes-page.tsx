import type { AccessLevel, LiveProvider, LiveStatus, LiveWhen, LocalizedText } from '@tk/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { CourseRow, CursorPage } from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';

export const PROVIDER_LABEL: Record<LiveProvider, string> = { youtube: 'YouTube Live', zoom: 'Zoom' };

export interface LiveClassRow {
  id: string;
  course: { id: string; slug: string; title: LocalizedText };
  title: LocalizedText;
  description: LocalizedText | null;
  provider: LiveProvider;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  accessLevel: AccessLevel;
  instructor: { name: string } | null;
  instructorId: string | null;
  status: LiveStatus;
  hasRecording: boolean;
  joinUrl: string;
  passcode: string | null;
  published: boolean;
  publishedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  cancelledAt: string | null;
  recording: { provider: 'youtube' | 'bunny'; videoId: string; title: string | null } | null;
  attendance: number;
}

/** Where a class is: a draft, or its live status once students can see it. */
export function LiveStatusBadge({ live }: { live: Pick<LiveClassRow, 'status' | 'published'> }) {
  if (live.status === 'cancelled') return <Badge tone="danger">Cancelled</Badge>;
  if (live.status === 'ended') return <Badge tone="neutral">Ended</Badge>;
  if (live.status === 'live') return <Badge tone="success">Live now</Badge>;
  if (!live.published) return <Badge tone="warning">Draft</Badge>;
  return <Badge tone="primary">Scheduled</Badge>;
}

export function useCourseOptions() {
  return useQuery({
    queryKey: ['courses', 'options'],
    queryFn: () => api.get<CursorPage<CourseRow>>('/admin/courses', { limit: 100 }),
  });
}

/** Live classes (S22, D-072): scheduled YouTube Live or Zoom classes for a course, with reminders and attendance. */
export function LiveClassesPage() {
  const [when, setWhen] = useState<LiveWhen>('upcoming');
  const [courseId, setCourseId] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const courses = useCourseOptions();
  const list = useQuery({
    queryKey: ['live-classes', when, courseId, cursor],
    queryFn: ({ signal }) =>
      api.get<CursorPage<LiveClassRow>>(
        '/admin/live-classes',
        { when, courseId: courseId || undefined, cursor, limit: 25 },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Live classes"
        description="Classes on YouTube Live or Zoom. Students are reminded when one is scheduled, before it starts and when it goes live."
        actions={
          <Button asChild>
            <Link to="/live-classes/$liveClassId" params={{ liveClassId: 'new' }}>
              <Plus /> New live class
            </Link>
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <Select
            aria-label="Show"
            className="w-48"
            value={when}
            onChange={(e) => {
              setWhen(e.target.value as LiveWhen);
              setCursors([]);
            }}
          >
            <option value="upcoming">Upcoming and live</option>
            <option value="past">Past</option>
          </Select>
          <Select
            aria-label="Course"
            className="w-72"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setCursors([]);
            }}
          >
            <option value="">All courses</option>
            {(courses.data?.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {localized(c.title)}
              </option>
            ))}
          </Select>
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.data.length === 0 ? (
          <EmptyState
            title={when === 'upcoming' ? 'No upcoming classes' : 'No past classes'}
            description="Schedule a class for a course, then publish it to tell its students."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Class</TH>
                  <TH>Course</TH>
                  <TH>Starts (Nepal time)</TH>
                  <TH>On</TH>
                  <TH>Access</TH>
                  <TH>Joined</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {list.data.data.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <Link
                        to="/live-classes/$liveClassId"
                        params={{ liveClassId: l.id }}
                        className="font-medium text-link"
                      >
                        {localized(l.title)}
                      </Link>
                      {l.instructor ? <p className="text-xs text-text-muted">{l.instructor.name}</p> : null}
                    </TD>
                    <TD className="text-sm">{localized(l.course.title)}</TD>
                    <TD className="whitespace-nowrap text-sm">
                      {formatDateTimeBs(l.startsAt)}
                      <p className="text-xs text-text-muted">{l.durationMinutes} min</p>
                    </TD>
                    <TD className="text-sm">{PROVIDER_LABEL[l.provider]}</TD>
                    <TD>
                      {l.accessLevel === 'premium' ? (
                        <Badge tone="premium">Premium</Badge>
                      ) : (
                        <Badge tone="success">Free</Badge>
                      )}
                    </TD>
                    <TD className="text-sm tabular-nums">{l.attendance}</TD>
                    <TD>
                      <LiveStatusBadge live={l} />
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
