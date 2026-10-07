import type { LocalizedText, PublishStatus } from '@tk/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Pin, Plus } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { STATUS_LABEL, type CursorPage } from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';

export const NOTICE_KIND = {
  official: 'Official notice',
  announcement: 'Announcement',
  instructor: 'Instructor message',
} as const;
export type NoticeKindName = keyof typeof NOTICE_KIND;

export interface NoticeRow {
  id: string;
  kind: NoticeKindName;
  title: LocalizedText;
  isPinned: boolean;
  expiresAt: string | null;
  notify: boolean;
  notifiedAt: string | null;
  status: PublishStatus;
  publishAt: string | null;
  live: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Notices (D-019, D-060): what students see in the app's Notice tab; optionally also by push and email. */
export function NoticesPage() {
  const [status, setStatus] = useState<'' | PublishStatus>('');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const list = useQuery({
    queryKey: ['notices', status, cursor],
    queryFn: ({ signal }) =>
      api.get<CursorPage<NoticeRow>>(
        '/admin/notices',
        { status: status || undefined, cursor, limit: 25 },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Notices"
        description="Official exam notices, announcements and instructor messages. They go to every student."
        actions={
          <Button asChild>
            <Link to="/notices/$noticeId" params={{ noticeId: 'new' }}>
              <Plus /> New notice
            </Link>
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <Select
            aria-label="Show"
            className="w-48"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setCursors([]);
            }}
          >
            <option value="">All notices</option>
            {(Object.keys(STATUS_LABEL) as PublishStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.data.length === 0 ? (
          <EmptyState title="No notices yet" description="Write one and publish it to show it in the app." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Notice</TH>
                  <TH>Kind</TH>
                  <TH>Push / email</TH>
                  <TH>Updated</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {list.data.data.map((n) => (
                  <TR key={n.id}>
                    <TD>
                      <Link
                        to="/notices/$noticeId"
                        params={{ noticeId: n.id }}
                        className="font-medium text-link"
                      >
                        {localized(n.title)}
                      </Link>
                      {n.isPinned ? (
                        <Pin aria-label="Pinned" className="ml-2 inline size-4 text-text-muted" />
                      ) : null}
                    </TD>
                    <TD className="text-sm">{NOTICE_KIND[n.kind]}</TD>
                    <TD className="text-sm">
                      {!n.notify ? (
                        <span className="text-text-muted">No</span>
                      ) : n.notifiedAt ? (
                        <Badge tone="success">Sent</Badge>
                      ) : (
                        <Badge tone="primary">When live</Badge>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-sm">{formatDateTimeBs(n.updatedAt)}</TD>
                    <TD>
                      <StatusBadge status={n.status} publishAt={n.publishAt} />
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
