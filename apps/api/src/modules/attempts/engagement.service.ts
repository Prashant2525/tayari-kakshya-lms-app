import { Injectable } from '@nestjs/common';
import {
  advanceStreak,
  countedAttempt,
  kathmanduDate,
  leaderboardName,
  rankEntries,
  resultsReleased,
  streakOn,
} from '@tk/domain';
import type { Assessment, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

/** Nepal calendar day of an instant as `YYYY-MM-DD` (daily challenges and streaks follow Nepal time). */
export function nepalDay(instant: Date): string {
  const d = kathmanduDate(instant);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** A stored `@db.Date` value as `YYYY-MM-DD`. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

interface Entry {
  attemptId: string;
  userId: string;
  score: number;
  timeTakenSeconds: number;
}

/**
 * Streaks and leaderboards (§10 part 3a, D-049). Ranks use each student's official attempt (D-048) among completed,
 * non-practice attempts — higher score first, then the faster time — and are shown only once results are released.
 * Computed when asked (always consistent with grading and release), rather than stored.
 */
@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** A daily challenge submitted on its day counts towards the streak. */
  async recordChallengeDay(tx: Prisma.TransactionClient, userId: string, day: string): Promise<void> {
    const row = await tx.userStreak.findUnique({ where: { userId } });
    const next = advanceStreak(
      {
        current: row?.currentDays ?? 0,
        longest: row?.longestDays ?? 0,
        lastDay: row ? isoDay(row.lastDay) : null,
      },
      day,
    );
    const data = {
      currentDays: next.current,
      longestDays: next.longest,
      lastDay: new Date(`${next.lastDay}T00:00:00Z`),
    };
    await tx.userStreak.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  }

  async streak(userId: string, now = new Date()) {
    const row = await this.prisma.userStreak.findUnique({ where: { userId } });
    const today = nepalDay(now);
    if (!row) return { current: 0, longest: 0, doneToday: false };
    const lastDay = isoDay(row.lastDay);
    return {
      current: streakOn({ current: row.currentDays, longest: row.longestDays, lastDay }, today),
      longest: row.longestDays,
      doneToday: lastDay === today,
    };
  }

  /** The ranking of an assessment (null when it has no leaderboard). */
  async leaderboard(a: Assessment, viewerId: string, limit = 50, now = new Date()) {
    if (!a.leaderboardEnabled) return null;
    if (!resultsReleased(a, now)) return { released: false, total: 0, me: null, top: [], names: null };
    const ranked = await this.ranked(a);
    const { names } = await this.settings.get('leaderboards.display');
    const shown = names === 'none' ? [] : ranked.slice(0, limit);
    const users = await this.prisma.user.findMany({
      where: { id: { in: shown.map((e) => e.userId) } },
      select: { id: true, fullName: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
    const mine = ranked.find((e) => e.userId === viewerId) ?? null;
    return {
      released: true,
      total: ranked.length,
      names,
      me: mine ? { rank: mine.rank, score: mine.score, timeTakenSeconds: mine.timeTakenSeconds } : null,
      top: shown.map((e) => ({
        rank: e.rank,
        name: e.userId === viewerId ? null : leaderboardName(nameOf.get(e.userId) ?? '', names),
        me: e.userId === viewerId,
        score: e.score,
        timeTakenSeconds: e.timeTakenSeconds,
      })),
    };
  }

  /** Rank of one attempt (only when it is the student's official, completed attempt and results are released). */
  async rankOf(a: Assessment, attemptId: string, now = new Date()) {
    if (!a.leaderboardEnabled || !resultsReleased(a, now)) return null;
    const ranked = await this.ranked(a);
    const entry = ranked.find((e) => e.attemptId === attemptId);
    return entry ? { rank: entry.rank, total: ranked.length } : null;
  }

  private async ranked(a: Assessment) {
    const attempts = await this.prisma.attempt.findMany({
      where: { assessmentId: a.id, practice: false, status: { in: ['pending_grading', 'completed'] } },
      select: { id: true, userId: true, attemptNo: true, status: true, score: true, timeTakenSeconds: true },
    });
    const byUser = new Map<string, typeof attempts>();
    for (const t of attempts) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t]);
    const entries: Entry[] = [];
    for (const [userId, list] of byUser) {
      const pick = countedAttempt(
        list.map((t) => ({
          id: t.id,
          attemptNo: t.attemptNo,
          score: t.status === 'completed' ? t.score : null,
          timeTakenSeconds: t.timeTakenSeconds ?? 0,
        })),
        a.countedAttempt,
      );
      const official = pick && list.find((t) => t.id === pick.id);
      // Attempts still awaiting marks are ranked once graded.
      if (official && official.status === 'completed' && official.score !== null) {
        entries.push({
          attemptId: official.id,
          userId,
          score: official.score,
          timeTakenSeconds: official.timeTakenSeconds ?? 0,
        });
      }
    }
    return rankEntries(entries);
  }
}
