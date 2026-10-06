import type { LocalizedText } from '@tk/contracts';

/** Refunds (D-026, D-057). Amounts are paisa. */

export const REFUND_STATUS = {
  requested: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved — send the money', tone: 'primary' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'success' },
} as const;
export type RefundStatus = keyof typeof REFUND_STATUS;

type Person = { id: string; fullName: string } | null;

export interface RefundView {
  id: string;
  status: RefundStatus;
  amountPaisa: number;
  full: boolean;
  reason: string;
  order: {
    id: string;
    orderNo: number;
    totalPaisa: number;
    status: string;
    student: { id: string; fullName: string };
    items: LocalizedText[];
  };
  requestedBy: Person;
  requestedAt: string;
  decidedBy: Person;
  decidedAt: string | null;
  decisionNote: string | null;
  refundedBy: Person;
  refundedAt: string | null;
  providerReference: string | null;
  refundNote: string | null;
}
