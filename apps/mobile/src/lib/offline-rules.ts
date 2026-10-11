/** A lesson saved for offline reading (S11, D-067). */
export interface OfflineEntry {
  id: string;
  type: 'note';
  title: { en?: string; ne?: string };
  /** The lesson's last change when it was saved. */
  version: string;
  /** Until when the saved copy may be opened without going online. */
  expiresAt: string;
  savedAt: string;
  courseId?: string;
  subjectId?: string;
  slug?: string;
  premium: boolean;
}

/** A device clock set back by more than this is treated as tampering. */
const CLOCK_SLACK_MS = 10 * 60_000;

/**
 * Whether a saved lesson may be opened now: before its licence expires, and only if the phone's clock has not been
 * moved back before the last time the server told us the time (which would stretch the licence).
 */
export function usable(
  entry: Pick<OfflineEntry, 'expiresAt'>,
  now: number,
  lastServerTime: string | null,
): boolean {
  if (lastServerTime && now < Date.parse(lastServerTime) - CLOCK_SLACK_MS) return false;
  return now < Date.parse(entry.expiresAt);
}

/** A media map with each picture's address replaced by its saved file (keys without a file keep the web address). */
export function withLocalMedia<M extends { url: string; variants: Record<string, string> }>(
  media: Record<string, M>,
  files: Record<string, string>,
): Record<string, M> {
  return Object.fromEntries(
    Object.entries(media).map(([id, m]) => {
      const local = files[id];
      if (!local) return [id, m];
      return [
        id,
        { ...m, url: local, variants: Object.fromEntries(Object.keys(m.variants).map((k) => [k, local])) },
      ];
    }),
  );
}
