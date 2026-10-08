import { Injectable } from '@nestjs/common';
import type {
  AnswerTally,
  LocalizedText,
  ProgressSummary,
  StudyActivity,
  StudyDay,
  StudyTimeInput,
  TopicStanding,
} from '@tk/contracts';
import { resultsReleased } from '@tk/domain';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { isoDay, nepalDay } from '../attempts/engagement.service.js';
import { SettingsService } from '../settings/settings.service.js';

const DAY_MS = 86_400_000;
/** Network delays: a report may arrive a little sooner after the previous one than the time it measured. */
const CLOCK_SLACK_SECONDS = 5;
const ACTIVITIES: StudyActivity[] = ['video', 'reading', 'practice', 'test'];

/** `YYYY-MM-DD` plus `n` days. */
export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Accuracy counts a partly correct answer as half: (correct + ½ partial) ÷ answered, a whole percent. */
export function tally(correct: number, partial: number, wrong: number): AnswerTally {
  const answered = correct + partial + wrong;
  return {
    answered,
    correct,
    partial,
    wrong,
    accuracy: answered ? Math.round(((correct + partial / 2) * 100) / answered) : null,
  };
}

/**
 * Seconds a study-time report may add: never more than the time since the student's previous report (plus a little
 * slack), so a client cannot inflate its study time by sending reports quickly or claiming long ones.
 */
export function creditableSeconds(claimed: number, lastReportAt: Date | null, now: Date): number {
  if (!lastReportAt) return claimed;
  const elapsed = Math.floor((now.getTime() - lastReportAt.getTime()) / 1000);
  return Math.max(0, Math.min(claimed, elapsed + CLOCK_SLACK_SECONDS));
}

interface TopicRow {
  subject_id: string;
  topic_id: string | null;
  correct: number;
  partial: number;
  wrong: number;
}

/**
 * Progress analytics (S8, D-066, T-064): study time per Nepal day and activity, finished lessons, accuracy by subject,
 * weak and strong topics (CMS thresholds) and recent test results. Accuracy uses auto-marked practice and revision
 * answers and the answers of completed tests whose results are released — never unreleased results.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async recordStudyTime(
    userId: string,
    input: StudyTimeInput,
    now = new Date(),
  ): Promise<{ credited: number }> {
    return this.prisma.$transaction(async (tx) => {
      // The first report starts the clock; later ones lock it, so two reports at once cannot both be credited for
      // the same time.
      const started = await tx.$queryRaw<Array<{ user_id: string }>>`
        INSERT INTO study_clocks (user_id, last_report_at) VALUES (${userId}::uuid, ${now})
        ON CONFLICT (user_id) DO NOTHING
        RETURNING user_id`;
      let credited = input.seconds;
      if (!started.length) {
        const [clock] = await tx.$queryRaw<Array<{ last_report_at: Date }>>`
          SELECT last_report_at FROM study_clocks WHERE user_id = ${userId}::uuid FOR UPDATE`;
        credited = creditableSeconds(input.seconds, clock?.last_report_at ?? null, now);
        await tx.studyClock.update({ where: { userId }, data: { lastReportAt: now } });
      }
      if (credited > 0) {
        await tx.$executeRaw`
          INSERT INTO study_time (user_id, day, activity, seconds, updated_at)
          VALUES (${userId}::uuid, ${nepalDay(now)}::date, ${input.activity}::"StudyActivity", ${credited}, ${now})
          ON CONFLICT (user_id, day, activity)
          DO UPDATE SET seconds = LEAST(study_time.seconds + EXCLUDED.seconds, 86400), updated_at = EXCLUDED.updated_at`;
      }
      return { credited };
    });
  }

  async summary(userId: string, now = new Date()): Promise<ProgressSummary> {
    const thresholds = await this.settings.get('progress.topics');
    const today = nepalDay(now);
    const since = new Date(now.getTime() - thresholds.windowDays * DAY_MS);

    const [studyRows, finished, finishedThisWeek, topicRows, attempts] = await Promise.all([
      this.prisma.studyTime.findMany({
        where: { userId, day: { gte: new Date(`${addDays(today, -29)}T00:00:00Z`) } },
      }),
      this.prisma.learningProgress.count({ where: { userId, completedAt: { not: null } } }),
      this.prisma.learningProgress.count({
        where: { userId, completedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      }),
      this.answersByTopic(userId, since, now),
      this.prisma.attempt.findMany({
        where: { userId, status: 'completed', score: { not: null } },
        include: { assessment: true },
        orderBy: { submittedAt: 'desc' },
        take: 40,
      }),
    ]);

    // Study time: the last 7 days for the chart, 30 for the month total.
    const days: StudyDay[] = Array.from({ length: 7 }, (_, i) => ({
      day: addDays(today, i - 6),
      seconds: { video: 0, reading: 0, practice: 0, test: 0 },
    }));
    let monthSeconds = 0;
    for (const row of studyRows) {
      monthSeconds += row.seconds;
      const day = days.find((d) => d.day === isoDay(row.day));
      if (day) day.seconds[row.activity] += row.seconds;
    }
    const daySeconds = (d: StudyDay) => ACTIVITIES.reduce((sum, a) => sum + d.seconds[a], 0);

    // Accuracy: overall, by subject, by topic.
    const total = { correct: 0, partial: 0, wrong: 0 };
    const bySubject = new Map<string, { correct: number; partial: number; wrong: number }>();
    const byTopic = new Map<string, { subjectId: string; correct: number; partial: number; wrong: number }>();
    for (const r of topicRows) {
      total.correct += r.correct;
      total.partial += r.partial;
      total.wrong += r.wrong;
      const s = bySubject.get(r.subject_id) ?? { correct: 0, partial: 0, wrong: 0 };
      s.correct += r.correct;
      s.partial += r.partial;
      s.wrong += r.wrong;
      bySubject.set(r.subject_id, s);
      if (r.topic_id) {
        const t = byTopic.get(r.topic_id) ?? { subjectId: r.subject_id, correct: 0, partial: 0, wrong: 0 };
        t.correct += r.correct;
        t.partial += r.partial;
        t.wrong += r.wrong;
        byTopic.set(r.topic_id, t);
      }
    }
    const [subjects, topics] = await Promise.all([
      this.prisma.subject.findMany({
        where: { id: { in: [...bySubject.keys()] }, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.topic.findMany({
        where: { id: { in: [...byTopic.keys()] }, deletedAt: null },
        select: { id: true, title: true },
      }),
    ]);
    const subjectName = new Map(subjects.map((s) => [s.id, s.name as LocalizedText]));
    const topicName = new Map(topics.map((t) => [t.id, t.title as LocalizedText]));

    const subjectList = [...bySubject]
      .filter(([id]) => subjectName.has(id))
      .map(([id, c]) => ({
        subjectId: id,
        subject: subjectName.get(id)!,
        ...tally(c.correct, c.partial, c.wrong),
      }))
      .sort((a, b) => b.answered - a.answered);
    const standings: TopicStanding[] = [...byTopic]
      .filter(([id, c]) => topicName.has(id) && subjectName.has(c.subjectId))
      .map(([id, c]) => ({
        topicId: id,
        topic: topicName.get(id)!,
        subjectId: c.subjectId,
        subject: subjectName.get(c.subjectId)!,
        ...tally(c.correct, c.partial, c.wrong),
      }))
      .filter((t) => t.answered >= thresholds.minAnswers);
    const weakTopics = standings
      .filter((t) => t.accuracy! < thresholds.weakBelow)
      .sort((a, b) => a.accuracy! - b.accuracy! || b.answered - a.answered)
      .slice(0, 10);
    const strongTopics = standings
      .filter((t) => t.accuracy! >= thresholds.strongFrom)
      .sort((a, b) => b.accuracy! - a.accuracy! || b.answered - a.answered)
      .slice(0, 10);

    // Released results only: the progress page must never reveal a result before the test does.
    const tests = attempts
      .filter((a) => resultsReleased(a.assessment, now) && a.submittedAt)
      .slice(0, 10)
      .map((a) => ({
        attemptId: a.id,
        title: a.assessment.title as LocalizedText,
        submittedAt: a.submittedAt!.toISOString(),
        percent: a.maxScore > 0 ? Math.max(0, Math.round((a.score! * 100) / a.maxScore)) : 0,
        passed: a.passed,
      }));

    return {
      studyTime: {
        days,
        todaySeconds: daySeconds(days[6]!),
        weekSeconds: days.reduce((sum, d) => sum + daySeconds(d), 0),
        monthSeconds,
      },
      lessons: { finished, finishedThisWeek },
      windowDays: thresholds.windowDays,
      accuracy: tally(total.correct, total.partial, total.wrong),
      subjects: subjectList,
      weakTopics,
      strongTopics,
      thresholds: {
        minAnswers: thresholds.minAnswers,
        weakBelow: thresholds.weakBelow,
        strongFrom: thresholds.strongFrom,
      },
      tests,
    };
  }

  /** Answer outcomes since `since` per subject and topic: practice / revision answers and released test answers. */
  private answersByTopic(userId: string, since: Date, now: Date): Promise<TopicRow[]> {
    return this.prisma.$queryRaw<TopicRow[]>`
      WITH answers AS (
        SELECT pa.question_id, pa.outcome
        FROM practice_answers pa
        WHERE pa.user_id = ${userId}::uuid AND pa.answered_at >= ${since}
        UNION ALL
        SELECT aa.question_id, aa.outcome
        FROM attempt_answers aa
        JOIN attempts a ON a.id = aa.attempt_id
        JOIN assessments s ON s.id = a.assessment_id
        WHERE a.user_id = ${userId}::uuid
          AND a.status = 'completed'
          AND a.submitted_at >= ${since}
          AND aa.outcome IN ('correct', 'partial', 'wrong')
          AND (s.result_release = 'immediate'
            OR (s.result_release = 'after_close' AND s.closes_at <= ${now})
            OR (s.result_release = 'manual' AND s.results_released_at <= ${now}))
      )
      SELECT q.subject_id, q.topic_id,
        count(*) FILTER (WHERE answers.outcome = 'correct')::int AS correct,
        count(*) FILTER (WHERE answers.outcome = 'partial')::int AS partial,
        count(*) FILTER (WHERE answers.outcome = 'wrong')::int AS wrong
      FROM answers
      JOIN questions q ON q.id = answers.question_id
      GROUP BY q.subject_id, q.topic_id`;
  }
}
