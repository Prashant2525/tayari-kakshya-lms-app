/** How another student appears on a leaderboard (D-049; CMS setting `leaderboards.display`). */
export type NameDisplay = 'first_initial' | 'full' | 'none';

/** "Aarati Sharma" → "Aarati S." (first name + initial of the last name); `none` shows no name. */
export function leaderboardName(fullName: string, mode: NameDisplay): string | null {
  if (mode === 'none') return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (mode === 'full' || parts.length < 2) return parts.join(' ');
  const last = [...(parts[parts.length - 1] ?? '')][0] ?? '';
  return `${parts[0]} ${last}.`;
}

export interface Ranked {
  score: number;
  timeTakenSeconds: number;
}

/** Competition ranking (1, 2, 2, 4): higher score first, then the faster time; equal score and time share a rank. */
export function rankEntries<T extends Ranked>(entries: T[]): Array<T & { rank: number }> {
  const sorted = [...entries].sort((a, b) => b.score - a.score || a.timeTakenSeconds - b.timeTakenSeconds);
  return sorted.map((e, i) => {
    let rank = i + 1;
    for (let j = i - 1; j >= 0; j--) {
      const p = sorted[j]!;
      if (p.score === e.score && p.timeTakenSeconds === e.timeTakenSeconds) rank = j + 1;
      else break;
    }
    return { ...e, rank };
  });
}
