import type { LocalizedText } from '@tk/contracts';
import { formatBs, instantToBs, NEPAL_TIME_ZONE } from '@tk/domain';

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: NEPAL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});

/** Bikram Sambat date in Nepal time (D-009), e.g. "16 Asoj 2083". */
export function formatDateBs(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return formatBs(instantToBs(new Date(iso)), 'en');
  } catch {
    return new Date(iso).toLocaleDateString('en-GB');
  }
}

/** "16 Asoj 2083, 14:05" (Nepal time). */
export function formatDateTimeBs(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${formatDateBs(iso)}, ${timeFormat.format(new Date(iso))}`;
}

/** Relative time for recent events, falling back to the BS date. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDateBs(iso);
}

/** Shows English with Nepali fallback (admin chrome is English; content keeps both). */
export function localized(text: LocalizedText | null | undefined): string {
  return text?.en ?? text?.ne ?? '';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** "1 paper", "3 papers". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
