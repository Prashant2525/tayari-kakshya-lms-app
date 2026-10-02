import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTimeBs } from '@/lib/format';

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorType: string;
  changes: unknown;
  ip: string | null;
  requestId: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; email: string | null; kind: string } | null;
}

const ENTITY_TYPES = ['user', 'role', 'system_setting', 'education_level', 'auth_session'];

function describeAction(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function AuditLogPage() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const cursor = cursors.at(-1);

  const log = useQuery({
    queryKey: ['audit', entityType, action, cursor],
    queryFn: ({ signal }) =>
      api.get<{ data: AuditEntry[]; nextCursor: string | null }>(
        '/admin/audit-logs',
        { entityType, action: action.trim(), cursor, limit: 30 },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="A permanent record of staff actions, security events and settings changes. Times are Nepal time."
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border px-5 py-4">
          <Select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setCursors([]);
            }}
            aria-label="Filter by record type"
            className="w-52"
          >
            <option value="">All record types</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </Select>
          <Input
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setCursors([]);
            }}
            placeholder="Exact action, e.g. settings.update"
            aria-label="Filter by action"
            className="max-w-xs"
          />
        </div>
        {log.isError ? (
          <ErrorState error={log.error} onRetry={() => void log.refetch()} />
        ) : log.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : log.data.data.length === 0 ? (
          <EmptyState title="No entries" description="Nothing has been recorded for these filters yet." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Who</TH>
                  <TH>Action</TH>
                  <TH>Record</TH>
                  <TH className="w-10">
                    <span className="sr-only">Details</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {log.data.data.map((entry) => (
                  <Fragment key={entry.id}>
                    <TR>
                      <TD className="whitespace-nowrap text-text-secondary">
                        {formatDateTimeBs(entry.createdAt)}
                      </TD>
                      <TD>
                        {entry.actor ? (
                          <>
                            <p className="font-semibold text-text">{entry.actor.fullName}</p>
                            <p className="text-xs text-text-muted">{entry.actor.email ?? entry.actor.kind}</p>
                          </>
                        ) : (
                          <span className="text-text-muted">System</span>
                        )}
                      </TD>
                      <TD>
                        <p className="text-text">{describeAction(entry.action)}</p>
                        <code className="text-xs text-text-muted">{entry.action}</code>
                      </TD>
                      <TD className="text-text-secondary">
                        {entry.entityType}
                        {entry.entityId ? (
                          <span className="block max-w-48 truncate text-xs text-text-muted">
                            {entry.entityId}
                          </span>
                        ) : null}
                      </TD>
                      <TD>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-expanded={expanded === entry.id}
                          aria-label="Show details"
                          onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                        >
                          {expanded === entry.id ? <ChevronUp /> : <ChevronDown />}
                        </Button>
                      </TD>
                    </TR>
                    {expanded === entry.id ? (
                      <TR>
                        <TD colSpan={5} className="bg-surface-muted/50">
                          <dl className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
                            <div>IP: {entry.ip ?? '—'}</div>
                            <div>Request: {entry.requestId ?? '—'}</div>
                          </dl>
                          <pre className="max-h-80 overflow-auto rounded-sm bg-surface p-3 text-xs leading-5 text-text">
                            {entry.changes
                              ? JSON.stringify(entry.changes, null, 2)
                              : 'No change details recorded.'}
                          </pre>
                        </TD>
                      </TR>
                    ) : null}
                  </Fragment>
                ))}
              </TBody>
            </Table>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={cursors.length === 0}
                onClick={() => setCursors((c) => c.slice(0, -1))}
              >
                <ChevronLeft /> Newer
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!log.data.nextCursor}
                onClick={() =>
                  log.data.nextCursor && setCursors((c) => [...c, log.data.nextCursor as string])
                }
              >
                Older <ChevronRight />
              </Button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
