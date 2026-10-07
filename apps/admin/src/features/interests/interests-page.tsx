import type { LocalizedText } from '@tk/contracts';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import type { CursorPage } from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';

interface InterestRow {
  id: string;
  student: { id: string; name: string; email: string | null };
  course: { id: string; slug: string; title: LocalizedText };
  deviceName: string;
  views: number;
  firstSeenAt: string;
  lastSeenAt: string;
  contactedAt: string | null;
  contactedBy: string | null;
  hasAccess: boolean;
}

interface EmailDraft {
  to: string;
  locale: 'en' | 'ne';
  link: string;
  subject: string;
  body: string;
}

/**
 * Interested on Apple devices (D-061). The iPhone app cannot sell courses or point to the website (D-027), so students
 * who open a course they cannot buy there are listed here, and staff can email them the course's website link —
 * outside the app, as Apple allows.
 */
export function InterestsPage() {
  const [status, setStatus] = useState<'' | 'open' | 'contacted'>('open');
  const [cursors, setCursors] = useState<string[]>([]);
  const [emailing, setEmailing] = useState<InterestRow | null>(null);
  const cursor = cursors.at(-1);
  const list = useQuery({
    queryKey: ['course-interests', status, cursor],
    queryFn: ({ signal }) =>
      api.get<CursorPage<InterestRow>>(
        '/admin/course-interests',
        { status: status || undefined, cursor, limit: 25 },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Interested on iPhone"
        description="Students on Apple devices who opened a paid course they cannot buy in the app. Email them the course's link on the website; the app itself cannot mention buying (Apple's rules)."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <Select
            aria-label="Show"
            className="w-56"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setCursors([]);
            }}
          >
            <option value="open">Not emailed yet</option>
            <option value="contacted">Emailed</option>
            <option value="">All</option>
          </Select>
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.data.length === 0 ? (
          <EmptyState
            title="No one here yet"
            description="When a student on an iPhone or iPad opens a paid course without access, they appear here."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Course</TH>
                  <TH>Device</TH>
                  <TH>Visits</TH>
                  <TH>Last seen</TH>
                  <TH>Status</TH>
                  <TH className="sr-only">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {list.data.data.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link
                        to="/students/$studentId"
                        params={{ studentId: r.student.id }}
                        className="font-medium text-link"
                      >
                        {r.student.name}
                      </Link>
                      <div className="text-xs text-text-muted">{r.student.email}</div>
                    </TD>
                    <TD className="text-sm">
                      <Link to="/courses/$courseId" params={{ courseId: r.course.id }} className="text-link">
                        {localized(r.course.title)}
                      </Link>
                    </TD>
                    <TD className="text-sm">{r.deviceName}</TD>
                    <TD className="text-sm tabular-nums">{r.views}</TD>
                    <TD className="whitespace-nowrap text-sm">{formatDateTimeBs(r.lastSeenAt)}</TD>
                    <TD className="text-sm">
                      {r.hasAccess ? (
                        <Badge tone="success">Has access now</Badge>
                      ) : r.contactedAt ? (
                        <span>
                          <Badge tone="primary">Emailed</Badge>
                          <span className="ml-2 text-xs text-text-muted">
                            {formatDateTimeBs(r.contactedAt)}
                            {r.contactedBy ? ` · ${r.contactedBy}` : ''}
                          </span>
                        </span>
                      ) : (
                        <Badge>Not emailed</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      {!r.hasAccess && r.student.email ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={`Email ${r.student.name} the link`}
                          onClick={() => setEmailing(r)}
                        >
                          <Mail /> Email link
                        </Button>
                      ) : null}
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
      {emailing ? <EmailDialog row={emailing} onClose={() => setEmailing(null)} /> : null}
    </>
  );
}

/** The CMS template, filled in for this student in their language; staff may change it before sending. */
function EmailDialog({ row, onClose }: { row: InterestRow; onClose: () => void }) {
  const qc = useQueryClient();
  const draft = useQuery({
    queryKey: ['course-interest-email', row.id],
    queryFn: ({ signal }) =>
      api.get<EmailDraft>(`/admin/course-interests/${row.id}/email`, undefined, signal),
  });
  const [edited, setEdited] = useState<{ subject: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = edited ?? (draft.data ? { subject: draft.data.subject, body: draft.data.body } : null);
  const send = async () => {
    if (!value) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/admin/course-interests/${row.id}/contact`, value);
      await qc.invalidateQueries({ queryKey: ['course-interests'] });
      toast.success(`Email sent to ${row.student.name}`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Email ${row.student.name}`}
      description={`About ${localized(row.course.title)}. {link} becomes the course's page on the website.`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => void send()} loading={sending} disabled={!value}>
            Send email
          </Button>
        </>
      }
    >
      {draft.isPending ? (
        <Spinner />
      ) : draft.isError ? (
        <Alert tone="danger" title={errorMessage(draft.error)} />
      ) : value ? (
        <div className="flex flex-col gap-4">
          {error ? <Alert tone="danger" title={error} /> : null}
          <p className="text-sm text-text-muted">
            To {draft.data.to} · {draft.data.locale === 'ne' ? 'Nepali' : 'English'} · link: {draft.data.link}
          </p>
          <Field label="Subject">
            {(a) => (
              <Input
                {...a}
                maxLength={150}
                value={value.subject}
                onChange={(e) => setEdited({ ...value, subject: e.target.value })}
              />
            )}
          </Field>
          <Field label="Message">
            {(a) => (
              <Textarea
                {...a}
                rows={10}
                maxLength={4000}
                value={value.body}
                onChange={(e) => setEdited({ ...value, body: e.target.value })}
              />
            )}
          </Field>
        </div>
      ) : null}
    </Dialog>
  );
}
