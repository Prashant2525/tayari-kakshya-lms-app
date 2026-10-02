import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardHeader, PageHeader, Switch } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { formatDateTimeBs, plural } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Problem {
  column: string;
  message: string;
}
interface PreviewRow {
  row: number;
  ref: string | null;
  type: string;
  preview: string;
  problems: Problem[];
  warnings: string[];
}
interface Preview {
  id: string;
  fileName: string;
  summary: { rows: number; valid: number; invalid: number; warnings: number; passages: number };
  fileProblems: string[];
  rows: PreviewRow[];
}
interface HistoryRow {
  id: string;
  fileName: string;
  status: 'previewed' | 'committed' | 'expired';
  summary: Preview['summary'];
  createdAt: string;
  committedAt: string | null;
  createdCount: number | null;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'danger' | 'warning';
}) {
  return (
    <div className="rounded-sm border border-border px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p
        className={cn(
          'text-2xl font-bold text-text',
          tone === 'success' && 'text-success',
          tone === 'danger' && value > 0 && 'text-danger',
          tone === 'warning' && value > 0 && 'text-warning',
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function QuestionImportPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ created: number; passages: number } | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useQuery({
    queryKey: ['question-imports'],
    queryFn: () => api.get<HistoryRow[]>('/admin/question-imports'),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setDone(null);
    setPreview(null);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      setPreview(await api.upload<Preview>('/admin/question-imports', form));
      await qc.invalidateQueries({ queryKey: ['question-imports'] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const commit = async () => {
    if (!preview) return;
    setCommitting(true);
    setError(null);
    try {
      const result = await api.post<{ created: number; passages: number }>(
        `/admin/question-imports/${preview.id}/commit`,
      );
      setDone(result);
      setPreview(null);
      toast.success(`${plural(result.created, 'question')} imported as drafts`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['questions'] }),
        qc.invalidateQueries({ queryKey: ['question-imports'] }),
      ]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCommitting(false);
    }
  };

  const rows = (preview?.rows ?? []).filter((r) => !problemsOnly || r.problems.length || r.warnings.length);

  return (
    <>
      <Link
        to="/questions"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Question bank
      </Link>
      <PageHeader
        title="Import questions"
        description="Upload the Excel template. You will see every problem before anything is saved; imported questions start as drafts."
      />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span className="grid size-12 place-items-center rounded-md bg-success-soft text-success">
            <FileSpreadsheet className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text">1. Fill the template</p>
            <p className="text-sm text-text-secondary">
              Its dropdowns list your current subjects, exam categories and papers. Up to 2,000 rows, 5 MB.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              void api
                .download('/admin/questions/import-template', 'question-import-template.xlsx')
                .catch((err: unknown) => toast.error(errorMessage(err)))
            }
          >
            <Download /> Download template
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-border p-5">
          <span className="grid size-12 place-items-center rounded-md bg-primary-soft text-on-primary-soft">
            <Upload className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text">2. Upload it and check the preview</p>
            <p className="text-sm text-text-secondary">Nothing is saved until you confirm.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label="Upload question spreadsheet"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload /> Upload .xlsx
          </Button>
        </div>
      </Card>

      {error ? (
        <div className="mb-6">
          <Alert tone="danger" title={error} />
        </div>
      ) : null}
      {done ? (
        <div className="mb-6">
          <Alert tone="success" title={`${plural(done.created, 'question')} imported as drafts`}>
            {done.passages ? `${plural(done.passages, 'passage')} created. ` : ''}
            <Link to="/questions" className="font-semibold text-link hover:underline">
              Review them in the Question bank
            </Link>{' '}
            and publish when ready.
          </Alert>
        </div>
      ) : null}

      {preview ? (
        <Card className="mb-6">
          <CardHeader
            title={`Preview: ${preview.fileName}`}
            description="Rows with problems are skipped. Fix them in Excel and upload again, or import the ready rows now."
            actions={
              <Button
                onClick={() => void commit()}
                loading={committing}
                disabled={preview.summary.valid === 0}
              >
                <CheckCircle2 /> Import {plural(preview.summary.valid, 'question')}
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
            <Stat label="Rows" value={preview.summary.rows} />
            <Stat label="Ready" value={preview.summary.valid} tone="success" />
            <Stat label="With problems" value={preview.summary.invalid} tone="danger" />
            <Stat label="With warnings" value={preview.summary.warnings} tone="warning" />
          </div>
          {preview.fileProblems.length ? (
            <div className="px-5 pb-4">
              <Alert tone="warning" title="About the file">
                <ul className="list-disc pl-5">
                  {preview.fileProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Alert>
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              Only rows with problems or warnings
              <Switch
                checked={problemsOnly}
                onCheckedChange={setProblemsOnly}
                label="Only rows with problems or warnings"
              />
            </label>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Row</TH>
                <TH>Question</TH>
                <TH>Result</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.row} className={r.problems.length ? 'bg-danger-soft/40' : undefined}>
                  <TD className="whitespace-nowrap align-top font-semibold">
                    {r.row}
                    {r.ref ? (
                      <span className="block text-xs font-normal text-text-muted">{r.ref}</span>
                    ) : null}
                  </TD>
                  <TD className="max-w-md align-top">
                    <p className="line-clamp-2">
                      {r.preview || <span className="text-text-muted">(no question text)</span>}
                    </p>
                    <p className="text-xs text-text-muted">{r.type || '—'}</p>
                  </TD>
                  <TD className="align-top">
                    {r.problems.length === 0 ? (
                      <Badge tone="success">Ready</Badge>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {r.problems.map((p, i) => (
                          <li key={i} className="text-sm text-danger">
                            <code className="mr-1 rounded bg-surface-muted px-1 text-xs text-text">
                              {p.column}
                            </code>
                            {p.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.warnings.map((w) => (
                      <p key={w} className="mt-1 flex items-start gap-1 text-xs text-warning">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w}
                      </p>
                    ))}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Your recent imports" />
        {history.data?.length ? (
          <ul className="divide-y divide-border">
            {history.data.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-text">{h.fileName}</span>
                <span className="text-text-muted">{formatDateTimeBs(h.createdAt)}</span>
                {h.status === 'committed' ? (
                  <Badge tone="success">{plural(h.createdCount ?? 0, 'question')} imported</Badge>
                ) : h.status === 'expired' ? (
                  <Badge>Expired</Badge>
                ) : (
                  <Badge tone="warning">Previewed, not imported</Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-text-muted">No imports yet.</p>
        )}
      </Card>
    </>
  );
}
