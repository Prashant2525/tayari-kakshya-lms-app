import { formatNpr, MoneyError, rupeesToPaisa } from '@tk/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { paisaToRupeesInput } from '@/lib/content';
import { formatDateTimeBs } from '@/lib/format';
import { REFUND_STATUS, type RefundView } from '@/lib/refunds';

const npr = (p: number) => formatNpr(p, 'en');

/**
 * Refunds on an order (D-026, D-057): request (with the reason), then approve or reject, then record the money as
 * sent with its reference. A refund that completes the order's total removes the access it gave.
 */
export function RefundsCard({
  orderId,
  orderStatus,
  totalPaisa,
  refunds,
}: {
  orderId: string;
  orderStatus: string;
  totalPaisa: number;
  refunds: RefundView[];
}) {
  const { can } = useAuth();
  const [asking, setAsking] = useState(false);
  const counted = refunds.filter((r) => r.status !== 'rejected').reduce((s, r) => s + r.amountPaisa, 0);
  const remaining = totalPaisa - counted;
  const canAsk = can('refunds:request') && orderStatus === 'paid' && remaining > 0;
  return (
    <Card>
      <CardHeader
        title="Refunds"
        description="Approved refunds that add up to the whole amount remove the access this order gave."
        actions={
          canAsk ? (
            <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
              Request refund
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col divide-y divide-border">
        {refunds.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted">No refunds.</p>
        ) : (
          refunds.map((r) => <RefundRow key={r.id} r={r} orderId={orderId} />)
        )}
      </div>
      {asking ? (
        <RequestDialog orderId={orderId} remaining={remaining} onClose={() => setAsking(false)} />
      ) : null}
    </Card>
  );
}

export function RefundRow({ r, orderId }: { r: RefundView; orderId: string }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [action, setAction] = useState<null | 'approve' | 'reject' | 'complete'>(null);
  const approver = can('refunds:approve');
  return (
    <div
      className="flex flex-col gap-2 px-5 py-4 text-sm"
      role="group"
      aria-label={`Refund ${npr(r.amountPaisa)}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-text">{npr(r.amountPaisa)}</span>
        <Badge tone={REFUND_STATUS[r.status].tone}>{REFUND_STATUS[r.status].label}</Badge>
        {r.full ? <Badge tone="danger">Access removed</Badge> : null}
      </div>
      <p className="text-text">{r.reason}</p>
      <p className="text-xs text-text-muted">
        Asked by {r.requestedBy?.fullName ?? '—'}, {formatDateTimeBs(r.requestedAt)}
        {r.decidedAt
          ? ` · ${r.status === 'rejected' ? 'Rejected' : 'Approved'} by ${r.decidedBy?.fullName ?? '—'}, ${formatDateTimeBs(r.decidedAt)}`
          : ''}
        {r.decisionNote ? ` — ${r.decisionNote}` : ''}
      </p>
      {r.refundedAt ? (
        <p className="text-xs text-text-muted">
          Sent by {r.refundedBy?.fullName ?? '—'}, {formatDateTimeBs(r.refundedAt)} · Reference{' '}
          <span className="font-mono">{r.providerReference}</span>
          {r.refundNote ? ` — ${r.refundNote}` : ''}
        </p>
      ) : null}
      {approver && (r.status === 'requested' || r.status === 'approved') ? (
        <div className="flex flex-wrap gap-2">
          {r.status === 'requested' ? (
            <>
              <Button size="sm" onClick={() => setAction('approve')}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAction('reject')}>
                Reject
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setAction('complete')}>
              Mark as refunded
            </Button>
          )}
        </div>
      ) : null}
      {action ? (
        <DecisionDialog
          r={r}
          action={action}
          onClose={() => setAction(null)}
          onDone={async () => {
            await qc.invalidateQueries({ queryKey: ['order', orderId] });
            await qc.invalidateQueries({ queryKey: ['orders'] });
            await qc.invalidateQueries({ queryKey: ['refunds'] });
          }}
        />
      ) : null}
    </div>
  );
}

function RequestDialog({
  orderId,
  remaining,
  onClose,
}: {
  orderId: string;
  remaining: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(paisaToRupeesInput(remaining));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    let paisa: number;
    try {
      paisa = rupeesToPaisa(amount.replace(/,/g, ''));
    } catch (err) {
      if (err instanceof MoneyError) return setError('Enter the amount in rupees, e.g. 1500');
      throw err;
    }
    if (paisa <= 0 || paisa > remaining) return setError(`Up to ${npr(remaining)} can be refunded`);
    if (reason.trim().length < 3) return setError('Write the reason');
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/orders/${orderId}/refunds`, { amountPaisa: paisa, reason: reason.trim() });
      await qc.invalidateQueries({ queryKey: ['order', orderId] });
      await qc.invalidateQueries({ queryKey: ['refunds'] });
      toast.success('Refund requested');
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
      title="Request refund"
      description={`Up to ${npr(remaining)}. The whole amount removes the student's access once approved; less keeps it.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            Request refund
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Amount (Rs)">
          {(a) => (
            <Input {...a} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          )}
        </Field>
        <Field label="Reason" hint="Recorded with the refund and in the audit log.">
          {(a) => <Textarea {...a} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

const DECISION = {
  approve: {
    title: 'Approve refund',
    button: 'Approve',
    success: 'Refund approved',
    path: 'approve',
  },
  reject: { title: 'Reject refund', button: 'Reject', success: 'Refund rejected', path: 'reject' },
  complete: {
    title: 'Mark as refunded',
    button: 'Mark as refunded',
    success: 'Refund recorded',
    path: 'complete',
  },
} as const;

function DecisionDialog({
  r,
  action,
  onClose,
  onDone,
}: {
  r: RefundView;
  action: keyof typeof DECISION;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const d = DECISION[action];
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (action === 'complete' && !reference.trim()) return setError('Enter the reference of the refund');
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/refunds/${r.id}/${d.path}`, {
        note: note.trim() || null,
        ...(action === 'complete' ? { reference: reference.trim() } : {}),
      });
      await onDone();
      toast.success(d.success);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const description =
    action === 'approve'
      ? `${npr(r.amountPaisa)} of ${npr(r.order.totalPaisa)}. If approved refunds then add up to the whole amount, the student loses the access this order gave.`
      : action === 'complete'
        ? 'Send the money back first (eSewa / Khalti merchant portal, or bank), then record its reference here.'
        : 'The student keeps access.';
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={d.title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            loading={saving}
            variant={action === 'reject' ? 'secondary' : 'primary'}
          >
            {d.button}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        {action === 'complete' ? (
          <Field label="Refund reference" hint="From the gateway or the bank.">
            {(a) => <Input {...a} value={reference} onChange={(e) => setReference(e.target.value)} />}
          </Field>
        ) : null}
        <Field label="Note" hint="Optional.">
          {(a) => <Textarea {...a} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
