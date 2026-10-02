import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner, Switch } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { toLocalized } from '@/lib/content';
import { localized } from '@/lib/format';
import { useNodeTypes, type NodeType } from '@/lib/node-types';

const KEY = /^[a-z][a-z0-9_]{1,39}$/;

function TypeDialog({ type, onClose }: { type: NodeType | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({
    key: type?.key ?? '',
    nameEn: type?.name.en ?? '',
    nameNe: type?.name.ne ?? '',
    descEn: type?.description?.en ?? '',
    rank: type?.rank.toString() ?? '',
    topLevel: type?.topLevel ?? false,
    canHavePapers: type?.canHavePapers ?? false,
    active: type?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((x) => ({ ...x, [k]: value }));
  const save = async () => {
    const name = toLocalized(v.nameEn, v.nameNe);
    if (!name) return setError('Enter the name in English, Nepali or both');
    if (!KEY.test(v.key))
      return setError('Key: start with a letter; use lowercase letters, digits and _ (e.g. exam_stage)');
    const rank = Number(v.rank);
    if (!Number.isInteger(rank) || rank < 1 || rank > 1000)
      return setError('Order: a whole number from 1 to 1000');
    const body = {
      key: v.key,
      name,
      description: toLocalized(v.descEn, ''),
      rank,
      topLevel: v.topLevel,
      canHavePapers: v.canHavePapers,
      active: v.active,
    };
    setSaving(true);
    setError(null);
    try {
      if (type) await api.put(`/admin/exam-node-types/${type.key}`, body);
      else await api.post('/admin/exam-node-types', body);
      await qc.invalidateQueries({ queryKey: ['exam-node-types'] });
      toast.success(type ? 'Category type saved' : 'Category type added');
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
      title={type ? `Edit ${localized(type.name)}` : 'Add a category type'}
      description="Category types are the levels of the exam tree, e.g. Authority › Service › Group › Sub-group › Post › Exam stage."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
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
          <Field label="Name (English)">
            {(a) => <Input {...a} value={v.nameEn} onChange={(e) => set('nameEn', e.target.value)} />}
          </Field>
          <Field label="नाम (नेपाली)">
            {(a) => (
              <Input {...a} lang="ne" value={v.nameNe} onChange={(e) => set('nameNe', e.target.value)} />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Key"
            hint={type ? 'Permanent; used by imports and the app.' : 'Permanent. e.g. exam_stage'}
          >
            {(a) => (
              <Input
                {...a}
                value={v.key}
                disabled={Boolean(type)}
                onChange={(e) => set('key', e.target.value.trim())}
              />
            )}
          </Field>
          <Field
            label="Order in the hierarchy"
            hint="Smaller = higher. A category can only contain types with a larger number."
          >
            {(a) => (
              <Input
                {...a}
                inputMode="numeric"
                value={v.rank}
                onChange={(e) => set('rank', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Description (for staff)">
          {(a) => <Input {...a} value={v.descEn} onChange={(e) => set('descEn', e.target.value)} />}
        </Field>
        {(
          [
            ['topLevel', 'Top level', 'Sits at the top of the tree (like an authority) and has no parent.'],
            [
              'canHavePapers',
              'Can have papers',
              'Exam papers can be linked to categories of this type (posts, exam stages).',
            ],
            ['active', 'Active', 'Inactive types cannot be used for new categories; existing ones stay.'],
          ] as const
        ).map(([k, label, hint]) => (
          <div
            key={k}
            className="flex items-center justify-between gap-3 rounded-sm border border-border p-3"
          >
            <div>
              <p className="text-sm font-semibold text-text">{label}</p>
              <p className="text-xs text-text-muted">{hint}</p>
            </div>
            <Switch checked={v[k]} onCheckedChange={(x) => set(k, x)} label={label} />
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function CategoryTypesPage() {
  const qc = useQueryClient();
  const nodeTypes = useNodeTypes();
  const [editing, setEditing] = useState<NodeType | 'new' | null>(null);
  const [deleting, setDeleting] = useState<NodeType | null>(null);
  return (
    <>
      <PageHeader
        title="Category types"
        description="The levels of the exam category tree. Rename them, add new levels (e.g. sub-group, exam stage) or turn them off — no code change needed."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add type
          </Button>
        }
      />
      <Card>
        {nodeTypes.isPending ? (
          <Spinner />
        ) : nodeTypes.types.length === 0 ? (
          <EmptyState title="No category types" description="Add at least one top-level type." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Order</TH>
                <TH>Type</TH>
                <TH>Rules</TH>
                <TH>Used by</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {nodeTypes.types.map((t) => (
                <TR key={t.key}>
                  <TD className="text-text-secondary">{t.rank}</TD>
                  <TD>
                    <p className="font-semibold">
                      {t.name.en ?? t.name.ne}
                      {t.name.en && t.name.ne ? (
                        <span className="ml-2 font-normal text-text-secondary" lang="ne">
                          {t.name.ne}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-text-muted">{t.key}</p>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      {t.topLevel ? <Badge tone="primary">Top level</Badge> : null}
                      {t.canHavePapers ? <Badge tone="success">Papers</Badge> : null}
                      {!t.active ? <Badge>Off</Badge> : null}
                    </div>
                  </TD>
                  <TD className="text-text-secondary">{t.nodeCount}</TD>
                  <TD className="whitespace-nowrap text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${localized(t.name)}`}
                      onClick={() => setEditing(t)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${localized(t.name)}`}
                      onClick={() => setDeleting(t)}
                    >
                      <Trash2 />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {editing ? (
        <TypeDialog type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete ${localized(deleting.name)}?`}
          description={
            deleting.nodeCount
              ? 'Categories use this type, so it cannot be deleted. Turn it off instead.'
              : 'It can no longer be used for categories.'
          }
          confirmLabel="Delete"
          onConfirm={async () => {
            await api.delete(`/admin/exam-node-types/${deleting.key}`);
            await qc.invalidateQueries({ queryKey: ['exam-node-types'] });
            toast.success('Category type deleted');
          }}
        />
      ) : null}
      {nodeTypes.types.length && !nodeTypes.types.some((t) => t.topLevel && t.active) ? (
        <div className="mt-4">
          <Alert tone="warning" title="No active top-level type">
            New category trees cannot be started until a top-level type is active.
          </Alert>
        </div>
      ) : null}
    </>
  );
}
