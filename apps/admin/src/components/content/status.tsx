import type { PublishStatus } from '@tk/contracts';
import { STATUS_LABEL } from '@/lib/content';
import { formatDateTimeBs } from '@/lib/format';
import { Badge } from '../ui/primitives';

const TONE = {
  draft: 'neutral',
  in_review: 'warning',
  scheduled: 'primary',
  published: 'success',
  archived: 'neutral',
} as const;

export function StatusBadge({
  status,
  publishAt,
  deleted,
}: {
  status: PublishStatus;
  publishAt?: string | null;
  deleted?: boolean;
}) {
  if (deleted) return <Badge tone="danger">Deleted</Badge>;
  const label =
    status === 'scheduled' && publishAt ? `Scheduled · ${formatDateTimeBs(publishAt)}` : STATUS_LABEL[status];
  return <Badge tone={TONE[status]}>{label}</Badge>;
}
