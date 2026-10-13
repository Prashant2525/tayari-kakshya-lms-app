import type { CampaignAudience, CampaignStatus, LocalizedText } from '@tk/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { CursorPage } from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';

export interface CampaignRow {
  id: string;
  title: LocalizedText;
  message: LocalizedText;
  audience: CampaignAudience;
  link: { type: 'course' | 'article' | 'notice'; id: string } | null;
  push: boolean;
  email: boolean;
  excludeIos: boolean;
  status: CampaignStatus;
  sendAt: string | null;
  sentAt: string | null;
  recipients: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const CAMPAIGN_STATUS: Record<
  CampaignStatus,
  { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'primary' },
  sending: { label: 'Sending', tone: 'warning' },
  sent: { label: 'Sent', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const AUDIENCE_LABEL: Record<CampaignAudience['type'], string> = {
  all: 'All students',
  courses: 'Students of chosen courses',
  exam_nodes: 'Students preparing for chosen exams',
};

export function audienceSummary(a: CampaignAudience): string {
  if (a.type === 'courses') return `${a.courseIds.length} course${a.courseIds.length === 1 ? '' : 's'}`;
  if (a.type === 'exam_nodes')
    return `${a.examNodeIds.length} exam categor${a.examNodeIds.length === 1 ? 'y' : 'ies'}`;
  return AUDIENCE_LABEL.all;
}

/** Notification campaigns (D-075 / audit F-08): messages from the team to groups of students. */
export function CampaignsPage() {
  const [status, setStatus] = useState<'' | CampaignStatus>('');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const list = useQuery({
    queryKey: ['campaigns', status, cursor],
    queryFn: ({ signal }) =>
      api.get<CursorPage<CampaignRow>>(
        '/admin/notification-campaigns',
        { status: status || undefined, cursor, limit: 25 },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Send a message to all students, the students of some courses, or those preparing for some exams — now or at a set time. It appears in their notifications; push and email follow each student's choices."
        actions={
          <Button asChild>
            <Link to="/campaigns/$campaignId" params={{ campaignId: 'new' }}>
              <Plus /> New campaign
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
            <option value="">All campaigns</option>
            {(Object.keys(CAMPAIGN_STATUS) as CampaignStatus[]).map((s) => (
              <option key={s} value={s}>
                {CAMPAIGN_STATUS[s].label}
              </option>
            ))}
          </Select>
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.data.length === 0 ? (
          <EmptyState title="No campaigns yet" description="Write one to reach a group of students." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Campaign</TH>
                  <TH>Audience</TH>
                  <TH>Channels</TH>
                  <TH>When</TH>
                  <TH>Students</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {list.data.data.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link
                        to="/campaigns/$campaignId"
                        params={{ campaignId: c.id }}
                        className="font-medium text-link"
                      >
                        {localized(c.title)}
                      </Link>
                    </TD>
                    <TD className="text-sm">{audienceSummary(c.audience)}</TD>
                    <TD className="text-sm">
                      {['In-app', c.push ? 'push' : null, c.email ? 'email' : null]
                        .filter(Boolean)
                        .join(', ')}
                    </TD>
                    <TD className="whitespace-nowrap text-sm">
                      {c.sentAt
                        ? formatDateTimeBs(c.sentAt)
                        : c.status === 'scheduled' && c.sendAt
                          ? formatDateTimeBs(c.sendAt)
                          : '—'}
                    </TD>
                    <TD className="text-sm">{c.status === 'sent' ? c.recipients : '—'}</TD>
                    <TD>
                      <Badge tone={CAMPAIGN_STATUS[c.status].tone}>{CAMPAIGN_STATUS[c.status].label}</Badge>
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
