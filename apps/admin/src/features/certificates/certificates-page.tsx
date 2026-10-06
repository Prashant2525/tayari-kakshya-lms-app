import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { LANGUAGE_LABEL, type CertificateTemplateRow, type IssuedCertificate } from '@/lib/certificates';
import { formatDateBs, formatDateTimeBs, localized, plural } from '@/lib/format';

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Certificate templates and issued certificates (D-049, D-050). */
export function CertificatesPage() {
  return (
    <>
      <PageHeader
        title="Certificates"
        description="Students receive a course's certificate automatically once they finish the share of lessons its template asks for."
        actions={
          <Button asChild>
            <Link to="/certificates/templates/new">
              <Plus /> New template
            </Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <TemplatesCard />
        <IssuedCard />
      </div>
    </>
  );
}

function TemplatesCard() {
  const list = useQuery({
    queryKey: ['certificate-templates'],
    queryFn: () => api.get<CertificateTemplateRow[]>('/admin/certificate-templates'),
  });
  return (
    <Card>
      <CardHeader
        title="Templates"
        description="Wording, signatories and the share of lessons. Choose a template for a course on the course's Certificate tab."
      />
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No templates yet" description="Create a template, then choose it for a course." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Language</TH>
              <TH>Lessons to finish</TH>
              <TH>Used by</TH>
              <TH>Issued</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {list.data.map((t) => (
              <TR key={t.id}>
                <TD>
                  <Link
                    to="/certificates/templates/$templateId"
                    params={{ templateId: t.id }}
                    className="font-medium text-link"
                  >
                    {t.name}
                  </Link>
                </TD>
                <TD>{LANGUAGE_LABEL[t.language]}</TD>
                <TD>{t.requiredPercent}%</TD>
                <TD>{plural(t.courseCount, 'course')}</TD>
                <TD>{t.issuedCount}</TD>
                <TD>
                  <Badge tone={t.active ? 'success' : 'neutral'}>{t.active ? 'Active' : 'Inactive'}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function IssuedCard() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'valid' | 'revoked'>('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [revoking, setRevoking] = useState<IssuedCertificate | null>(null);
  const [reinstating, setReinstating] = useState<IssuedCertificate | null>(null);
  const search = useDebounced(q.trim());
  const cursor = cursors.at(-1);
  const list = useQuery({
    queryKey: ['certificates', search, status, cursor],
    queryFn: ({ signal }) =>
      api.get<{ data: IssuedCertificate[]; nextCursor: string | null }>(
        '/admin/certificates',
        { q: search || undefined, status: status || undefined, cursor, limit: 25 },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['certificates'] });

  return (
    <Card>
      <CardHeader
        title="Issued certificates"
        description="Revoked certificates no longer verify and their PDF is not served; you can reinstate them."
      />
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <div className="relative min-w-60 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursors([]);
            }}
            placeholder="Search by student name, email or certificate number"
            aria-label="Search certificates"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setCursors([]);
          }}
          aria-label="Filter by status"
          className="w-44"
        >
          <option value="">All certificates</option>
          <option value="valid">Valid</option>
          <option value="revoked">Revoked</option>
        </Select>
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <Spinner />
      ) : list.data.data.length === 0 ? (
        <EmptyState
          title={search || status ? 'No certificates match your filters' : 'No certificates issued yet'}
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Certificate no.</TH>
                <TH>Student</TH>
                <TH>Course</TH>
                <TH>Issued</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {list.data.data.map((c) => (
                <TR key={c.id}>
                  <TD className="whitespace-nowrap font-mono text-sm">{c.code}</TD>
                  <TD>
                    <Link
                      to="/students/$studentId"
                      params={{ studentId: c.student.id }}
                      className="font-medium text-link"
                    >
                      {c.student.fullName}
                    </Link>
                    {c.holderName !== c.student.fullName ? (
                      <p className="text-xs text-text-muted">Printed as {c.holderName}</p>
                    ) : null}
                  </TD>
                  <TD>{localized(c.course.title)}</TD>
                  <TD className="whitespace-nowrap">{formatDateBs(c.issuedAt)}</TD>
                  <TD>
                    {c.revoked ? (
                      <>
                        <Badge tone="danger">Revoked</Badge>
                        <p className="mt-1 max-w-56 text-xs text-text-muted">
                          {formatDateTimeBs(c.revoked.at)}
                          {c.revoked.by ? ` by ${c.revoked.by}` : ''}: {c.revoked.reason}
                        </p>
                      </>
                    ) : (
                      <Badge tone="success">Valid</Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    {c.revoked ? (
                      <Button variant="secondary" size="sm" onClick={() => setReinstating(c)}>
                        Reinstate
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => setRevoking(c)}>
                        Revoke
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {cursors.length > 0 || list.data.nextCursor ? (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={cursors.length === 0}
                onClick={() => setCursors((c) => c.slice(0, -1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!list.data.nextCursor}
                onClick={() => setCursors((c) => [...c, list.data.nextCursor as string])}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
      {revoking ? (
        <RevokeDialog
          certificate={revoking}
          onClose={() => setRevoking(null)}
          onDone={() => void refresh()}
        />
      ) : null}
      <ConfirmDialog
        open={reinstating !== null}
        onOpenChange={(o) => !o && setReinstating(null)}
        title="Reinstate this certificate?"
        tone="primary"
        confirmLabel="Reinstate"
        description={
          reinstating
            ? `${reinstating.code} for ${reinstating.holderName} will verify as valid again and its PDF can be opened.`
            : ''
        }
        onConfirm={async () => {
          await api.post(`/admin/certificates/${reinstating!.id}/reinstate`);
          await refresh();
          toast.success('Certificate reinstated');
        }}
      />
    </Card>
  );
}

function RevokeDialog({
  certificate,
  onClose,
  onDone,
}: {
  certificate: IssuedCertificate;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const revoke = async () => {
    if (reason.trim().length < 3) return setError('Give a reason (at least 3 characters)');
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/certificates/${certificate.id}/revoke`, { reason: reason.trim() });
      toast.success('Certificate revoked');
      onDone();
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
      title="Revoke certificate?"
      description={`${certificate.code} · ${certificate.holderName} · ${localized(certificate.course.title)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void revoke()} loading={saving}>
            Revoke
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <p className="text-sm text-text-secondary">
          Anyone checking this number will see it as revoked, and its PDF can no longer be opened. The student
          is not issued a new one.
        </p>
        <Field label="Reason (kept in the audit log)">
          {(a) => <Textarea {...a} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
