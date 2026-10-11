/** A cell value; null and undefined become empty cells. */
export type Cell = string | number | boolean | null | undefined;

/**
 * One CSV cell (RFC 4180): quoted when it holds a comma, quote or line break. Text that a spreadsheet would run as a
 * formula (starting with = + - @, a tab or a carriage return) gets a leading apostrophe, so an export can never carry a
 * formula a student typed into their name or a review.
 */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A CSV file: a byte-order mark first so Excel reads the UTF-8 (Nepali text) correctly, CRLF line ends, the header
 * row, then the data rows.
 */
export function csv(header: string[], rows: Cell[][]): string {
  return `\uFEFF${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Rupees with two decimals from paisa (exports show money as accountants read it). */
export const rupees = (paisa: number | null | undefined) =>
  paisa === null || paisa === undefined ? '' : (paisa / 100).toFixed(2);
