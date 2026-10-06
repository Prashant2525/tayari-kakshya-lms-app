import { CERTIFICATE_SIGNATORIES_MAX, type CertificateLanguage, type LocalizedText } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, FileDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, CardHeader, ErrorState, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { LANGUAGE_LABEL, type CertificateTemplate } from '@/lib/certificates';
import { toLocalized } from '@/lib/content';
import { localized } from '@/lib/format';

interface Pair {
  en: string;
  ne: string;
}
const pair = (t: LocalizedText | null | undefined): Pair => ({ en: t?.en ?? '', ne: t?.ne ?? '' });

interface FormValues {
  name: string;
  language: CertificateLanguage;
  requiredPercent: string;
  title: Pair;
  intro: Pair;
  statement: Pair;
  issuerName: Pair;
  signatories: Array<{ name: Pair; role: Pair }>;
  active: boolean;
}

const EMPTY: FormValues = {
  name: '',
  language: 'en',
  requiredPercent: '',
  title: { en: '', ne: '' },
  intro: { en: '', ne: '' },
  statement: { en: '', ne: '' },
  issuerName: { en: '', ne: '' },
  signatories: [],
  active: true,
};

function fromTemplate(t: CertificateTemplate): FormValues {
  return {
    name: t.name,
    language: t.language,
    requiredPercent: String(t.requiredPercent),
    title: pair(t.title),
    intro: pair(t.intro),
    statement: pair(t.statement),
    issuerName: pair(t.issuerName),
    signatories: t.signatories.map((s) => ({ name: pair(s.name), role: pair(s.role) })),
    active: t.active,
  };
}

/** The request body, or a message saying what is missing. */
function toInput(v: FormValues): { body: unknown } | { error: string } {
  if (!v.name.trim()) return { error: 'Give the template a name' };
  const percent = Number(v.requiredPercent);
  if (!/^\d+$/.test(v.requiredPercent.trim()) || percent < 1 || percent > 100)
    return { error: 'Lessons to finish must be a whole number from 1 to 100' };
  const need = (p: Pair, label: string) => {
    const text = toLocalized(p.en, p.ne);
    if (!text) throw new Error(`Enter the ${label}`);
    return text;
  };
  try {
    return {
      body: {
        name: v.name.trim(),
        language: v.language,
        requiredPercent: percent,
        title: need(v.title, 'certificate title'),
        intro: toLocalized(v.intro.en, v.intro.ne),
        statement: need(v.statement, 'line between the name and the course'),
        issuerName: need(v.issuerName, 'issuer'),
        signatories: v.signatories.map((s, i) => ({
          name: need(s.name, `name of signatory ${i + 1}`),
          role: need(s.role, `role of signatory ${i + 1}`),
        })),
        active: v.active,
      },
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function PairFields({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: Pair;
  onChange: (v: Pair) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={`${label} (English)`} hint={hint}>
        {(a) => (
          <Input {...a} value={value.en} onChange={(e) => onChange({ ...value, en: e.target.value })} />
        )}
      </Field>
      <Field label={`${label} (नेपाली)`}>
        {(a) => (
          <Input
            {...a}
            lang="ne"
            value={value.ne}
            onChange={(e) => onChange({ ...value, ne: e.target.value })}
          />
        )}
      </Field>
    </div>
  );
}

function TemplateForm({ template }: { template: CertificateTemplate | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [v, setV] = useState<FormValues>(template ? fromTemplate(template) : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setV((x) => ({ ...x, [key]: value }));
  const setSignatory = (i: number, s: FormValues['signatories'][number]) =>
    set(
      'signatories',
      v.signatories.map((x, j) => (j === i ? s : x)),
    );

  const save = async () => {
    const input = toInput(v);
    if ('error' in input) return setError(input.error);
    setSaving(true);
    setError(null);
    try {
      if (template) {
        await api.put(`/admin/certificate-templates/${template.id}`, input.body);
        await qc.invalidateQueries({ queryKey: ['certificate-template', template.id] });
      } else {
        const created = await api.post<{ id: string }>('/admin/certificate-templates', input.body);
        void navigate({ to: '/certificates/templates/$templateId', params: { templateId: created.id } });
      }
      await qc.invalidateQueries({ queryKey: ['certificate-templates'] });
      toast.success('Template saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const preview = async () => {
    setPreviewing(true);
    try {
      await api.download(`/admin/certificate-templates/${template!.id}/preview`, 'certificate-preview.pdf');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-6">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Card>
          <CardHeader title="Rule" />
          <div className="flex flex-col gap-4 p-5">
            <Field label="Template name" hint="For staff only, e.g. “Standard course completion”.">
              {(a) => <Input {...a} value={v.name} onChange={(e) => set('name', e.target.value)} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Lessons to finish (%)"
                hint="Share of the course's lessons a student must finish."
              >
                {(a) => (
                  <Input
                    {...a}
                    inputMode="numeric"
                    value={v.requiredPercent}
                    onChange={(e) => set('requiredPercent', e.target.value)}
                  />
                )}
              </Field>
              <Field label="Certificate language" hint="The language printed on the certificate.">
                {(a) => (
                  <Select
                    {...a}
                    value={v.language}
                    onChange={(e) => set('language', e.target.value as CertificateLanguage)}
                  >
                    {(Object.keys(LANGUAGE_LABEL) as CertificateLanguage[]).map((l) => (
                      <option key={l} value={l}>
                        {LANGUAGE_LABEL[l]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-sm border border-border p-3">
              <div>
                <p className="text-sm font-semibold text-text">Active</p>
                <p className="text-xs text-text-muted">
                  Inactive templates issue no new certificates; issued ones stay valid.
                </p>
              </div>
              <Switch checked={v.active} onCheckedChange={(x) => set('active', x)} label="Active" />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Wording"
            description="Printed around the student's name and the course title. Fill in the certificate's language; the other is optional."
          />
          <div className="flex flex-col gap-4 p-5">
            <PairFields
              label="Issuer"
              hint="Shown at the top."
              value={v.issuerName}
              onChange={(x) => set('issuerName', x)}
            />
            <PairFields label="Title" value={v.title} onChange={(x) => set('title', x)} />
            <PairFields
              label="Before the name"
              hint="Optional, e.g. “This is to certify that”."
              value={v.intro}
              onChange={(x) => set('intro', x)}
            />
            <PairFields
              label="Before the course"
              hint="e.g. “has successfully completed the course”."
              value={v.statement}
              onChange={(x) => set('statement', x)}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Signatories"
            description={`Up to ${CERTIFICATE_SIGNATORIES_MAX}, printed along the bottom.`}
            actions={
              <Button
                variant="secondary"
                size="sm"
                disabled={v.signatories.length >= CERTIFICATE_SIGNATORIES_MAX}
                onClick={() =>
                  set('signatories', [
                    ...v.signatories,
                    { name: { en: '', ne: '' }, role: { en: '', ne: '' } },
                  ])
                }
              >
                <Plus /> Add signatory
              </Button>
            }
          />
          <div className="flex flex-col gap-4 p-5">
            {v.signatories.length === 0 ? <p className="text-sm text-text-muted">No signatories.</p> : null}
            {v.signatories.map((s, i) => (
              <fieldset key={i} className="flex flex-col gap-3 rounded-sm border border-border p-4">
                <div className="flex items-center justify-between">
                  <legend className="text-sm font-semibold text-text">Signatory {i + 1}</legend>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove signatory ${i + 1}`}
                    onClick={() =>
                      set(
                        'signatories',
                        v.signatories.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
                <PairFields
                  label="Name"
                  value={s.name}
                  onChange={(x) => setSignatory(i, { ...s, name: x })}
                />
                <PairFields
                  label="Role"
                  value={s.role}
                  onChange={(x) => setSignatory(i, { ...s, role: x })}
                />
              </fieldset>
            ))}
          </div>
          <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
            <Button onClick={() => void save()} loading={saving}>
              Save
            </Button>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        {template ? (
          <>
            <Card>
              <CardHeader title="Preview" description="A sample certificate from the saved template." />
              <div className="p-5">
                <Button variant="secondary" onClick={() => void preview()} loading={previewing}>
                  <FileDown /> Download sample PDF
                </Button>
              </div>
            </Card>
            <Card>
              <CardHeader title="Courses using it" />
              <div className="p-5">
                {template.courses.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    None yet. Choose this template on a course's Certificate tab.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {template.courses.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2">
                        <Link
                          to="/courses/$courseId"
                          params={{ courseId: c.id }}
                          search={{ tab: 'certificate' }}
                          className="text-sm font-medium text-link"
                        >
                          {localized(c.title)}
                        </Link>
                        <StatusBadge status={c.status as never} publishAt={null} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </>
        ) : null}
        <Card>
          <CardHeader title="Changes" />
          <p className="p-5 text-sm text-text-secondary">
            Edits apply to certificates issued from now on. Issued certificates keep their wording and the
            name the student had when it was issued.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Back() {
  return (
    <Link
      to="/certificates"
      className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
    >
      <ArrowLeft className="size-4" /> Certificates
    </Link>
  );
}

export function NewCertificateTemplatePage() {
  return (
    <>
      <Back />
      <h1 className="mb-5 text-[26px] font-bold leading-8 tracking-tight text-text">
        New certificate template
      </h1>
      <TemplateForm template={null} />
    </>
  );
}

export function CertificateTemplatePage() {
  const { templateId } = useParams({ from: '/app/certificates/templates/$templateId' });
  const t = useQuery({
    queryKey: ['certificate-template', templateId],
    queryFn: () => api.get<CertificateTemplate>(`/admin/certificate-templates/${templateId}`),
  });
  if (t.isPending) return <Spinner />;
  if (t.isError) return <ErrorState error={t.error} onRetry={() => void t.refetch()} />;
  return (
    <>
      <Back />
      <h1 className="mb-5 text-[26px] font-bold leading-8 tracking-tight text-text">{t.data.name}</h1>
      <TemplateForm key={t.data.updatedAt} template={t.data} />
    </>
  );
}
