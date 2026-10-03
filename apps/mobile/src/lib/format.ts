import { formatNpr, toDevanagariDigits } from '@tk/domain';
import type { Locale } from '@/i18n/translate';

const digits = (text: string, locale: Locale) => (locale === 'ne' ? toDevanagariDigits(text) : text);

/** Video length: "10:29" or "1:02:05". */
export function formatDuration(seconds: number, locale: Locale): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return digits(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`, locale);
}

/** Whole-number percentage; 0 when there is nothing to complete. */
export function percent(done: number, total: number): number {
  return total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;
}

/** Price from paisa, in the reader's language (e.g. "Rs 3,000" / "रु ३,०००"). */
export function price(paisa: number, locale: Locale): string {
  return formatNpr(paisa, locale);
}
