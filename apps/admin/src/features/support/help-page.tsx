import type { LocalizedText } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
  Switch,
} from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { toLocalized } from '@/lib/content';
import { localized } from '@/lib/format';

interface FaqRow {
  id: string;
  question: LocalizedText;
  answer: LocalizedText;
  sortOrder: number;
  active: boolean;
  hideOnIos: boolean;
}

const CONTACT_TYPE = {
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  viber: 'Viber',
  email: 'Email',
  website: 'Website',
  facebook: 'Facebook',
  address: 'Address',
} as const;
type ContactType = keyof typeof CONTACT_TYPE;

interface ContactRow {
  id: string;
  type: ContactType;
  label: LocalizedText;
  value: string;
  note: LocalizedText | null;
  sortOrder: number;
  active: boolean;
}

/** Help & support (D-034, D-064): FAQs and the ways to contact you, shown in the app's Profile and on the website. */
export function HelpPage() {
  return (
    <>
      <PageHeader
        title="Help & support"
        description="Shown in the app (Profile → Help & support) and on the website's Help page."
      />
      <div className="flex flex-col gap-6">
        <FaqsCard />
        <ContactsCard />
      </div>
    </>
  );
}

function FaqsCard() {
  const list = useQuery({
    queryKey: ['faqs'],
    queryFn: ({ signal }) => api.get<FaqRow[]>('/admin/faqs', undefined, signal),
  });
  const [editing, setEditing] = useState<FaqRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<FaqRow | null>(null);
  const qc = useQueryClient();
  return (
    <Card>
      <CardHeader
        title="Frequently asked questions"
        description="In order. An answer that mentions buying on the website must be hidden in the iPhone app (Apple's rules)."
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> Add a question
          </Button>
        }
      />
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No questions yet" description="Add the questions students ask most." />
      ) : (
        <ul className="divide-y divide-border">
          {list.data.map((f) => (
            <li key={f.id} className="flex items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{localized(f.question)}</p>
                <p className="line-clamp-2 text-sm text-text-muted">{localized(f.answer)}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {!f.active ? <Badge>Hidden</Badge> : null}
                  {f.hideOnIos ? <Badge tone="primary">Not in the iPhone app</Badge> : null}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Edit ${localized(f.question)}`}
                onClick={() => setEditing(f)}
              >
                <Pencil />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${localized(f.question)}`}
                onClick={() => setRemoving(f)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <FaqDialog
          faq={editing === 'new' ? null : editing}
          nextOrder={(list.data?.at(-1)?.sortOrder ?? 0) + 1}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this question?"
        description={removing ? localized(removing.question) : ''}
        confirmLabel="Delete"
        onConfirm={async () => {
          await api.delete(`/admin/faqs/${removing!.id}`);
          await qc.invalidateQueries({ queryKey: ['faqs'] });
          toast.success('Question deleted');
        }}
      />
    </Card>
  );
}

function FaqDialog({
  faq,
  nextOrder,
  onClose,
}: {
  faq: FaqRow | null;
  nextOrder: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [v, setV] = useState({
    qEn: faq?.question.en ?? '',
    qNe: faq?.question.ne ?? '',
    aEn: faq?.answer.en ?? '',
    aNe: faq?.answer.ne ?? '',
    sortOrder: faq?.sortOrder ?? nextOrder,
    active: faq?.active ?? true,
    hideOnIos: faq?.hideOnIos ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const question = toLocalized(v.qEn, v.qNe);
    const answer = toLocalized(v.aEn, v.aNe);
    if (!question || !answer) return setError('Write the question and the answer in English, Nepali or both');
    setSaving(true);
    setError(null);
    try {
      const body = { question, answer, sortOrder: v.sortOrder, active: v.active, hideOnIos: v.hideOnIos };
      if (faq) await api.put(`/admin/faqs/${faq.id}`, body);
      else await api.post('/admin/faqs', body);
      await qc.invalidateQueries({ queryKey: ['faqs'] });
      toast.success('Question saved');
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
      title={faq ? 'Edit question' : 'Add a question'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Question (English)">
            {(a) => (
              <Input
                {...a}
                maxLength={300}
                value={v.qEn}
                onChange={(e) => setV({ ...v, qEn: e.target.value })}
              />
            )}
          </Field>
          <Field label="प्रश्न (नेपाली)">
            {(a) => (
              <Input
                {...a}
                lang="ne"
                maxLength={300}
                value={v.qNe}
                onChange={(e) => setV({ ...v, qNe: e.target.value })}
              />
            )}
          </Field>
          <Field label="Answer (English)">
            {(a) => (
              <Textarea
                {...a}
                rows={5}
                maxLength={3000}
                value={v.aEn}
                onChange={(e) => setV({ ...v, aEn: e.target.value })}
              />
            )}
          </Field>
          <Field label="उत्तर (नेपाली)">
            {(a) => (
              <Textarea
                {...a}
                lang="ne"
                rows={5}
                maxLength={3000}
                value={v.aNe}
                onChange={(e) => setV({ ...v, aNe: e.target.value })}
              />
            )}
          </Field>
        </div>
        <Field label="Order" className="w-32">
          {(a) => (
            <Input
              {...a}
              type="number"
              min={0}
              value={v.sortOrder}
              onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) || 0 })}
            />
          )}
        </Field>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">Shown to students</span>
          <Switch
            checked={v.active}
            onCheckedChange={(x) => setV({ ...v, active: x })}
            label="Shown to students"
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">Hide in the iPhone app (the answer mentions buying)</span>
          <Switch
            checked={v.hideOnIos}
            onCheckedChange={(x) => setV({ ...v, hideOnIos: x })}
            label="Hide in the iPhone app"
          />
        </div>
      </div>
    </Dialog>
  );
}

function ContactsCard() {
  const list = useQuery({
    queryKey: ['contact-options'],
    queryFn: ({ signal }) => api.get<ContactRow[]>('/admin/contact-options', undefined, signal),
  });
  const [editing, setEditing] = useState<ContactRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<ContactRow | null>(null);
  const qc = useQueryClient();
  return (
    <Card>
      <CardHeader
        title="Contact options"
        description="How students reach you: phone, WhatsApp, Viber, email, website, Facebook or an address."
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> Add a contact option
          </Button>
        }
      />
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No contact options yet" description="Add at least a phone number or an email." />
      ) : (
        <ul className="divide-y divide-border">
          {list.data.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {localized(c.label)}{' '}
                  <span className="text-sm font-normal text-text-muted">· {CONTACT_TYPE[c.type]}</span>
                </p>
                <p className="text-sm text-text-muted">
                  {c.value}
                  {c.note ? ` · ${localized(c.note)}` : ''}
                </p>
                {!c.active ? <Badge>Hidden</Badge> : null}
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Edit ${localized(c.label)}`}
                onClick={() => setEditing(c)}
              >
                <Pencil />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${localized(c.label)}`}
                onClick={() => setRemoving(c)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <ContactDialog
          contact={editing === 'new' ? null : editing}
          nextOrder={(list.data?.at(-1)?.sortOrder ?? 0) + 1}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this contact option?"
        description={removing ? `${localized(removing.label)}: ${removing.value}` : ''}
        confirmLabel="Delete"
        onConfirm={async () => {
          await api.delete(`/admin/contact-options/${removing!.id}`);
          await qc.invalidateQueries({ queryKey: ['contact-options'] });
          toast.success('Contact option deleted');
        }}
      />
    </Card>
  );
}

const VALUE_HINT: Record<ContactType, string> = {
  phone: 'e.g. +977 9800000000 or 01-4000000',
  whatsapp: 'The WhatsApp number, e.g. +977 9800000000',
  viber: 'The Viber number, e.g. +977 9800000000',
  email: 'e.g. help@yourdomain.com',
  website: 'An https:// link',
  facebook: 'Your page, https://facebook.com/…',
  address: 'The address as it should be shown',
};

function ContactDialog({
  contact,
  nextOrder,
  onClose,
}: {
  contact: ContactRow | null;
  nextOrder: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [v, setV] = useState({
    type: contact?.type ?? ('phone' as ContactType),
    labelEn: contact?.label.en ?? '',
    labelNe: contact?.label.ne ?? '',
    value: contact?.value ?? '',
    noteEn: contact?.note?.en ?? '',
    noteNe: contact?.note?.ne ?? '',
    sortOrder: contact?.sortOrder ?? nextOrder,
    active: contact?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const label = toLocalized(v.labelEn, v.labelNe) ?? { en: CONTACT_TYPE[v.type] };
    setSaving(true);
    setError(null);
    try {
      const body = {
        type: v.type,
        label,
        value: v.value.trim(),
        note: toLocalized(v.noteEn, v.noteNe),
        sortOrder: v.sortOrder,
        active: v.active,
      };
      if (contact) await api.put(`/admin/contact-options/${contact.id}`, body);
      else await api.post('/admin/contact-options', body);
      await qc.invalidateQueries({ queryKey: ['contact-options'] });
      toast.success('Contact option saved');
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
      title={contact ? 'Edit contact option' : 'Add a contact option'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            {(a) => (
              <Select
                {...a}
                value={v.type}
                onChange={(e) => setV({ ...v, type: e.target.value as ContactType })}
              >
                {(Object.keys(CONTACT_TYPE) as ContactType[]).map((t) => (
                  <option key={t} value={t}>
                    {CONTACT_TYPE[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Value" hint={VALUE_HINT[v.type]}>
            {(a) => (
              <Input
                {...a}
                maxLength={300}
                value={v.value}
                onChange={(e) => setV({ ...v, value: e.target.value })}
              />
            )}
          </Field>
          <Field label="Label (English)" hint="e.g. Call us, Support email">
            {(a) => (
              <Input
                {...a}
                maxLength={80}
                value={v.labelEn}
                onChange={(e) => setV({ ...v, labelEn: e.target.value })}
              />
            )}
          </Field>
          <Field label="नाम (नेपाली)">
            {(a) => (
              <Input
                {...a}
                lang="ne"
                maxLength={80}
                value={v.labelNe}
                onChange={(e) => setV({ ...v, labelNe: e.target.value })}
              />
            )}
          </Field>
          <Field label="Note (English)" hint="Optional, e.g. Sunday–Friday, 10am–5pm">
            {(a) => (
              <Input
                {...a}
                maxLength={160}
                value={v.noteEn}
                onChange={(e) => setV({ ...v, noteEn: e.target.value })}
              />
            )}
          </Field>
          <Field label="टिप्पणी (नेपाली)">
            {(a) => (
              <Input
                {...a}
                lang="ne"
                maxLength={160}
                value={v.noteNe}
                onChange={(e) => setV({ ...v, noteNe: e.target.value })}
              />
            )}
          </Field>
        </div>
        <Field label="Order" className="w-32">
          {(a) => (
            <Input
              {...a}
              type="number"
              min={0}
              value={v.sortOrder}
              onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) || 0 })}
            />
          )}
        </Field>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">Shown to students</span>
          <Switch
            checked={v.active}
            onCheckedChange={(x) => setV({ ...v, active: x })}
            label="Shown to students"
          />
        </div>
      </div>
    </Dialog>
  );
}
