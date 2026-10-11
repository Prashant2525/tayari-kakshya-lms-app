import { Injectable } from '@nestjs/common';
import type { AnalyticsRange, LocalizedText, QuestionContent } from '@tk/contracts';
import { Errors } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { nepalDay } from '../attempts/engagement.service.js';
import { addDays } from '../progress/progress.service.js';
import { stemPreview } from '../questions/questions.service.js';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;
/** A question is ranked "hardest" only with enough answers to mean something. */
const MIN_ANSWERS_FOR_DIFFICULTY = 10;
const TOP = 10;

export interface Period {
  from: string;
  to: string;
  /** First instant of `from` and of the day after `to`, in Nepal time. */
  start: Date;
  end: Date;
  days: string[];
}

/** Rows of `{ d: 'YYYY-MM-DD', ... }` spread over every day of the period (missing days are zero). */
function series<K extends string>(period: Period, rows: Array<{ d: string } & Record<K, number>>, keys: K[]) {
  const byDay = new Map(rows.map((r) => [r.d, r]));
  return period.days.map((day) => ({
    day,
    ...(Object.fromEntries(keys.map((k) => [k, Number(byDay.get(day)?.[k] ?? 0)])) as Record<K, number>),
  }));
}

const nptDay = (column: string) => `to_char(${column} AT TIME ZONE 'Asia/Kathmandu', 'YYYY-MM-DD')`;

/**
 * Admin dashboards (Phase 13e, D-066, T-068): sales & revenue, students, learning, tests & questions over a period of
 * Nepal days. Numbers come straight from the records (paid orders, refunds sent, sign-in sessions, entitlements,
 * progress, study time, attempts, answers, reports) when asked — nothing is pre-aggregated.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  period(range: AnalyticsRange, now = new Date()): Period {
    const to = range.to ?? nepalDay(now);
    const from = range.from ?? addDays(to, -(DEFAULT_DAYS - 1));
    const span = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    if (span < 1 || span > MAX_DAYS) {
      throw Errors.validation([{ path: 'from', message: `Choose a period of 1 to ${MAX_DAYS} days` }]);
    }
    return {
      from,
      to,
      start: new Date(`${from}T00:00:00+05:45`),
      end: new Date(`${addDays(to, 1)}T00:00:00+05:45`),
      days: Array.from({ length: span }, (_, i) => addDays(from, i)),
    };
  }

  async sales(range: AnalyticsRange) {
    const p = this.period(range);
    const paid = `o.paid_at >= $1 AND o.paid_at < $2 AND o.status IN ('paid', 'refunded')`;
    const [daily, totals, refunds, channels, providers, items] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ d: string; orders: number; revenue: number }>>(
        `SELECT ${nptDay('o.paid_at')} AS d, count(*)::int AS orders, sum(o.total_paisa)::bigint AS revenue
         FROM orders o WHERE ${paid} GROUP BY 1`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<
        Array<{ orders: number; revenue: number; discount: number; coupons: number }>
      >(
        `SELECT count(*)::int AS orders, coalesce(sum(o.total_paisa), 0)::bigint AS revenue,
                coalesce(sum(o.discount_paisa), 0)::bigint AS discount,
                count(*) FILTER (WHERE o.coupon_id IS NOT NULL)::int AS coupons
         FROM orders o WHERE ${paid}`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: number; amount: number }>>(
        `SELECT count(*)::int AS count, coalesce(sum(amount_paisa), 0)::bigint AS amount
         FROM refunds WHERE status = 'refunded' AND refunded_at >= $1 AND refunded_at < $2`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<Array<{ key: string; orders: number; revenue: number }>>(
        `SELECT o.channel::text AS key, count(*)::int AS orders, sum(o.total_paisa)::bigint AS revenue
         FROM orders o WHERE ${paid} GROUP BY 1 ORDER BY 3 DESC`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<Array<{ key: string; orders: number; revenue: number }>>(
        `SELECT pm.provider::text AS key, count(DISTINCT o.id)::int AS orders, sum(o.total_paisa)::bigint AS revenue
         FROM orders o JOIN payments pm ON pm.order_id = o.id AND pm.status = 'completed' AND NOT pm.duplicate
         WHERE ${paid} GROUP BY 1 ORDER BY 3 DESC`,
        p.start,
        p.end,
      ),
      // Checkout sells one course or plan per order, so an order's total belongs to its item.
      this.prisma.$queryRawUnsafe<
        Array<{ type: string; id: string; title: LocalizedText; orders: number; revenue: number }>
      >(
        `SELECT i.item_type AS type, coalesce(i.course_id, i.plan_id)::text AS id,
                (array_agg(i.title_snapshot ORDER BY o.paid_at DESC))[1] AS title,
                count(*)::int AS orders, sum(o.total_paisa)::bigint AS revenue
         FROM orders o JOIN order_items i ON i.order_id = o.id
         WHERE ${paid} GROUP BY 1, 2 ORDER BY 5 DESC LIMIT ${TOP}`,
        p.start,
        p.end,
      ),
    ]);
    const t = totals[0]!;
    const r = refunds[0]!;
    const num = (v: unknown) => Number(v ?? 0);
    return {
      period: { from: p.from, to: p.to },
      totals: {
        orders: t.orders,
        revenuePaisa: num(t.revenue),
        refundsPaisa: num(r.amount),
        refunds: r.count,
        netPaisa: num(t.revenue) - num(r.amount),
        averageOrderPaisa: t.orders ? Math.round(num(t.revenue) / t.orders) : 0,
        discountPaisa: num(t.discount),
        couponOrders: t.coupons,
      },
      daily: series(
        p,
        daily.map((x) => ({ d: x.d, orders: x.orders, revenuePaisa: num(x.revenue) })),
        ['orders', 'revenuePaisa'],
      ),
      channels: channels.map((c) => ({ key: c.key, orders: c.orders, revenuePaisa: num(c.revenue) })),
      providers: providers.map((c) => ({ key: c.key, orders: c.orders, revenuePaisa: num(c.revenue) })),
      items: items.map((i) => ({
        type: i.type,
        id: i.id,
        title: i.title,
        orders: i.orders,
        revenuePaisa: num(i.revenue),
      })),
    };
  }

  async students(range: AnalyticsRange) {
    const p = this.period(range);
    const [total, daily, active, signupPlatforms, activePlatforms] = await Promise.all([
      this.prisma.user.count({ where: { kind: 'student', status: { not: 'deleted' } } }),
      this.prisma.$queryRawUnsafe<Array<{ d: string; signups: number }>>(
        `SELECT ${nptDay('created_at')} AS d, count(*)::int AS signups FROM users
         WHERE kind = 'student' AND created_at >= $1 AND created_at < $2 GROUP BY 1`,
        p.start,
        p.end,
      ),
      // Active: used the app or website (a signed-in session was used) during the period.
      this.prisma.$queryRawUnsafe<Array<{ d: string; active: number }>>(
        `SELECT ${nptDay('s.last_used_at')} AS d, count(DISTINCT s.user_id)::int AS active
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE u.kind = 'student' AND s.last_used_at >= $1 AND s.last_used_at < $2 GROUP BY 1`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<Array<{ key: string; count: number }>>(
        `SELECT first.platform::text AS key, count(*)::int AS count FROM (
           SELECT DISTINCT ON (s.user_id) s.platform FROM auth_sessions s JOIN users u ON u.id = s.user_id
           WHERE u.kind = 'student' AND u.created_at >= $1 AND u.created_at < $2
           ORDER BY s.user_id, s.created_at
         ) first GROUP BY 1 ORDER BY 2 DESC`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<Array<{ key: string; count: number }>>(
        `SELECT s.platform::text AS key, count(DISTINCT s.user_id)::int AS count
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE u.kind = 'student' AND s.last_used_at >= $1 AND s.last_used_at < $2 GROUP BY 1 ORDER BY 2 DESC`,
        p.start,
        p.end,
      ),
    ]);
    const activeInPeriod = await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(DISTINCT s.user_id)::int AS count FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE u.kind = 'student' AND s.last_used_at >= $1 AND s.last_used_at < $2`,
      p.start,
      p.end,
    );
    return {
      period: { from: p.from, to: p.to },
      totals: {
        students: total,
        signups: daily.reduce((sum, d) => sum + d.signups, 0),
        active: activeInPeriod[0]?.count ?? 0,
      },
      daily: series(
        p,
        p.days.map((d) => ({
          d,
          signups: daily.find((x) => x.d === d)?.signups ?? 0,
          active: active.find((x) => x.d === d)?.active ?? 0,
        })),
        ['signups', 'active'],
      ),
      signupPlatforms,
      activePlatforms,
    };
  }

  async learning(range: AnalyticsRange) {
    const p = this.period(range);
    const [enrolments, finished, study, sources, courses, lessons] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ d: string; enrolments: number }>>(
        `SELECT ${nptDay('created_at')} AS d, count(*)::int AS enrolments FROM entitlements
         WHERE created_at >= $1 AND created_at < $2 GROUP BY 1`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<Array<{ d: string; lessons: number }>>(
        `SELECT ${nptDay('completed_at')} AS d, count(*)::int AS lessons FROM learning_progress
         WHERE completed_at >= $1 AND completed_at < $2 GROUP BY 1`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<Array<{ d: string; seconds: number; learners: number }>>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS d, sum(seconds)::bigint AS seconds, count(DISTINCT user_id)::int AS learners
         FROM study_time WHERE day >= $1::date AND day <= $2::date GROUP BY 1`,
        p.from,
        p.to,
      ),
      this.prisma.$queryRawUnsafe<Array<{ key: string; count: number }>>(
        `SELECT source_type::text AS key, count(*)::int AS count FROM entitlements
         WHERE created_at >= $1 AND created_at < $2 GROUP BY 1 ORDER BY 2 DESC`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<Array<{ id: string; title: LocalizedText; enrolments: number }>>(
        `SELECT c.id::text AS id, c.title, count(*)::int AS enrolments FROM entitlements e
         JOIN courses c ON c.id = e.course_id
         WHERE e.scope_type = 'course' AND e.created_at >= $1 AND e.created_at < $2
         GROUP BY 1, 2 ORDER BY 3 DESC LIMIT ${TOP}`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<
        Array<{ id: string; title: LocalizedText; type: string; finished: number }>
      >(
        `SELECT li.id::text AS id, li.title, li.type::text AS type, count(*)::int AS finished
         FROM learning_progress lp JOIN learning_items li ON li.id = lp.learning_item_id
         WHERE lp.completed_at >= $1 AND lp.completed_at < $2
         GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT ${TOP}`,
        p.start,
        p.end,
      ),
    ]);
    const studySeconds = study.reduce((sum, s) => sum + Number(s.seconds), 0);
    const learners = await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(DISTINCT user_id)::int AS count FROM study_time WHERE day >= $1::date AND day <= $2::date`,
      p.from,
      p.to,
    );
    return {
      period: { from: p.from, to: p.to },
      totals: {
        enrolments: enrolments.reduce((sum, d) => sum + d.enrolments, 0),
        lessonsFinished: finished.reduce((sum, d) => sum + d.lessons, 0),
        studySeconds,
        learners: learners[0]?.count ?? 0,
      },
      daily: p.days.map((day) => ({
        day,
        enrolments: enrolments.find((x) => x.d === day)?.enrolments ?? 0,
        lessonsFinished: finished.find((x) => x.d === day)?.lessons ?? 0,
        studySeconds: Number(study.find((x) => x.d === day)?.seconds ?? 0),
      })),
      sources,
      courses,
      lessons,
    };
  }

  async tests(range: AnalyticsRange) {
    const p = this.period(range);
    const done = `a.status IN ('completed', 'pending_grading') AND a.submitted_at >= $1 AND a.submitted_at < $2`;
    const [daily, assessments, hardest, reported] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ d: string; attempts: number }>>(
        `SELECT ${nptDay('a.submitted_at')} AS d, count(*)::int AS attempts FROM attempts a WHERE ${done} GROUP BY 1`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          title: LocalizedText;
          attempts: number;
          students: number;
          average: number | null;
          passed: number;
          graded: number;
        }>
      >(
        `SELECT s.id::text AS id, s.title, count(*)::int AS attempts, count(DISTINCT a.user_id)::int AS students,
                round(avg(CASE WHEN a.score IS NOT NULL AND a.max_score > 0 THEN greatest(a.score, 0) * 100.0 / a.max_score END))::int AS average,
                count(*) FILTER (WHERE a.passed)::int AS passed,
                count(*) FILTER (WHERE a.passed IS NOT NULL)::int AS graded
         FROM attempts a JOIN assessments s ON s.id = a.assessment_id
         WHERE ${done} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT ${TOP}`,
        p.start,
        p.end,
      ),
      // Test and practice answers in the period; partly correct counts half.
      this.prisma.$queryRawUnsafe<Array<{ id: string; answered: number; accuracy: number }>>(
        `WITH answers AS (
           SELECT aa.question_id, aa.outcome FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
           WHERE ${done} AND aa.outcome IN ('correct', 'partial', 'wrong')
           UNION ALL
           SELECT question_id, outcome FROM practice_answers WHERE answered_at >= $1 AND answered_at < $2
         )
         SELECT question_id::text AS id, count(*)::int AS answered,
                round((count(*) FILTER (WHERE outcome = 'correct') + 0.5 * count(*) FILTER (WHERE outcome = 'partial')) * 100.0 / count(*))::int AS accuracy
         FROM answers GROUP BY 1 HAVING count(*) >= ${MIN_ANSWERS_FOR_DIFFICULTY}
         ORDER BY 3 ASC, 2 DESC LIMIT ${TOP}`,
        p.start,
        p.end,
      ),
      this.prisma.$queryRawUnsafe<Array<{ id: string; reports: number }>>(
        `SELECT question_id::text AS id, count(*)::int AS reports FROM question_reports
         WHERE status = 'open' GROUP BY 1 ORDER BY 2 DESC LIMIT ${TOP}`,
      ),
    ]);
    const previews = await this.questionPreviews([...hardest, ...reported].map((q) => q.id));
    return {
      period: { from: p.from, to: p.to },
      totals: {
        attempts: daily.reduce((sum, d) => sum + d.attempts, 0),
        openReports: await this.prisma.questionReport.count({ where: { status: 'open' } }),
      },
      daily: series(p, daily, ['attempts']),
      assessments,
      hardest: hardest.map((q) => ({ ...q, ...previews.get(q.id) })),
      minAnswersForDifficulty: MIN_ANSWERS_FOR_DIFFICULTY,
      reported: reported.map((q) => ({ ...q, ...previews.get(q.id) })),
    };
  }

  private async questionPreviews(ids: string[]) {
    const rows = await this.prisma.question.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        currentVersion: { select: { content: true } },
        subject: { select: { name: true } },
      },
    });
    return new Map(
      rows.map((q) => [
        q.id,
        {
          preview: stemPreview(q.currentVersion?.content as QuestionContent | undefined),
          subject: q.subject.name as LocalizedText,
        },
      ]),
    );
  }
}
