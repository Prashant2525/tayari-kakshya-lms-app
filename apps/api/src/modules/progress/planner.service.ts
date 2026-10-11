import { Injectable } from '@nestjs/common';
import type {
  LocalizedText,
  PlanDayView,
  PlanTaskView,
  StudyPlanInput,
  StudyPlanSummary,
  StudyPlanView,
} from '@tk/contracts';
import { buildStudyPlan, planDayAdd, type PlanTask } from '@tk/domain';
import { Errors } from '../../common/errors/app-error.js';
import type { StudyPlan } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { isoDay, nepalDay } from '../attempts/engagement.service.js';
import { AttemptsService } from '../attempts/attempts.service.js';
import { EntitlementsService } from '../content/entitlements.service.js';
import { liveWhere, publishedWhere } from '../content/publishing.js';
import { SettingsService } from '../settings/settings.service.js';

/** How far ahead an exam may be set. */
const MAX_DAYS_AHEAD = 3 * 366;

type Task = PlanTask & Omit<PlanTaskView, 'done' | 'minutes' | 'id'>;

/**
 * Study planner (S7, D-066, T-065). A plan stores only the course, the exam day and the minutes a day; the days are
 * worked out on each request from the student's unfinished lessons and tests they can open (course order; a test
 * after the lessons of its topic, chapter or subject; one that opens later on its opening day), so the plan always
 * starts from today and re-plans by itself when the student falls behind.
 */
@Injectable()
export class PlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly attempts: AttemptsService,
    private readonly settings: SettingsService,
  ) {}

  async save(
    userId: string,
    courseId: string,
    input: StudyPlanInput,
    now = new Date(),
  ): Promise<StudyPlanView> {
    if (!(await this.entitlements.activeCourseIds(userId, now)).has(courseId))
      throw Errors.notFound('Course');
    const today = nepalDay(now);
    if (input.examDate <= today || input.examDate > planDayAdd(today, MAX_DAYS_AHEAD)) {
      throw Errors.validation([
        { path: 'examDate', message: 'Choose an exam date after today, within three years' },
      ]);
    }
    const data = { examDate: new Date(`${input.examDate}T00:00:00Z`), minutesPerDay: input.minutesPerDay };
    const plan = await this.prisma.studyPlan.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId, ...data },
      update: data,
    });
    return this.view(plan, now);
  }

  async remove(userId: string, courseId: string): Promise<void> {
    const removed = await this.prisma.studyPlan.deleteMany({ where: { userId, courseId } });
    if (!removed.count) throw Errors.notFound('Study plan');
  }

  async get(userId: string, courseId: string, now = new Date()): Promise<StudyPlanView> {
    const plan = await this.prisma.studyPlan.findUnique({ where: { userId_courseId: { userId, courseId } } });
    if (!plan) throw Errors.notFound('Study plan');
    return this.view(plan, now);
  }

  /** Every plan of the student, with today's work only (Home and the planner list). */
  async list(userId: string, now = new Date()): Promise<{ data: StudyPlanSummary[] }> {
    const plans = await this.prisma.studyPlan.findMany({ where: { userId }, orderBy: { examDate: 'asc' } });
    const today = nepalDay(now);
    const data = await Promise.all(
      plans.map(async (p) => {
        const view: Partial<StudyPlanView> = await this.view(p, now);
        const todays = view.days?.find((d) => d.day === today) ?? null;
        delete view.days;
        delete view.unscheduled;
        return { ...(view as Omit<StudyPlanView, 'days' | 'unscheduled'>), today: todays };
      }),
    );
    return { data };
  }

  private async view(plan: StudyPlan, now: Date): Promise<StudyPlanView> {
    const course = await this.prisma.course.findUniqueOrThrow({ where: { id: plan.courseId } });
    const access = (await this.entitlements.activeCourseIds(plan.userId, now)).has(plan.courseId);
    const today = nepalDay(now);
    const examDay = isoDay(plan.examDate);
    const tasks = access ? await this.tasks(plan.userId, plan.courseId, examDay, now) : [];
    const built = buildStudyPlan(tasks, { today, examDay, minutesPerDay: plan.minutesPerDay });
    const left = tasks.filter((t) => !t.done);
    return {
      courseId: plan.courseId,
      course: { title: course.title as LocalizedText, slug: course.slug },
      examDate: examDay,
      minutesPerDay: plan.minutesPerDay,
      access,
      studyDays: built.studyDays,
      minutesLeft: built.minutesLeft,
      lessonsLeft: left.filter((t) => t.kind === 'lesson').length,
      testsLeft: left.filter((t) => t.kind === 'test').length,
      neededMinutesPerDay: built.neededMinutesPerDay,
      onTrack: built.onTrack,
      days: built.days.map((d): PlanDayView => ({ ...d, tasks: d.tasks.map(taskView) })),
      unscheduled: built.unscheduled.map(taskView),
    };
  }

  /** The course's lessons and tests the student can open, in course order, with estimates and what is done. */
  private async tasks(userId: string, courseId: string, examDay: string, now: Date) {
    const est = await this.settings.get('planner.estimates');
    const links = await this.prisma.courseSubject.findMany({
      where: { courseId, subject: publishedWhere },
      orderBy: { sortOrder: 'asc' },
      include: { subject: { select: { id: true, name: true } } },
    });
    const subjectIds = links.map((l) => l.subjectId);
    // The same rule as opening a lesson: free, or premium access to its subject (through any course or plan).
    const premiumSubjects = new Set<string>();
    for (const id of subjectIds) {
      if (await this.entitlements.hasSubjectAccess(userId, id, now)) premiumSubjects.add(id);
    }

    const items = await this.prisma.learningItem.findMany({
      where: {
        ...liveWhere(now),
        topic: { ...publishedWhere, chapter: { ...publishedWhere, subjectId: { in: subjectIds } } },
      },
      include: {
        pdf: { select: { pageCount: true } },
        topic: {
          select: {
            id: true,
            sortOrder: true,
            chapter: { select: { id: true, sortOrder: true, subjectId: true } },
          },
        },
      },
    });
    const subjectOrder = new Map(subjectIds.map((id, i) => [id, i]));
    items.sort(
      (a, b) =>
        subjectOrder.get(a.topic.chapter.subjectId)! - subjectOrder.get(b.topic.chapter.subjectId)! ||
        a.topic.chapter.sortOrder - b.topic.chapter.sortOrder ||
        a.topic.sortOrder - b.topic.sortOrder ||
        a.sortOrder - b.sortOrder ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const open = items.filter(
      (i) => i.accessLevel === 'free' || premiumSubjects.has(i.topic.chapter.subjectId),
    );
    const finished = new Map(
      (
        await this.prisma.learningProgress.findMany({
          where: { userId, completedAt: { not: null }, learningItemId: { in: open.map((i) => i.id) } },
          select: { learningItemId: true, completedAt: true },
        })
      ).map((p) => [p.learningItemId, p.completedAt!]),
    );
    const subjectName = new Map(links.map((l) => [l.subjectId, l.subject.name as LocalizedText]));
    const minutesOf = (i: (typeof open)[number]) => {
      if (i.type === 'video') return i.durationSeconds ? Math.ceil(i.durationSeconds / 60) : est.videoMinutes;
      if (i.type === 'pdf' && i.pdf?.pageCount) return i.pdf.pageCount * est.pdfMinutesPerPage;
      return est.noteMinutes;
    };
    type Anchored = Task & { topicId?: string; chapterId?: string; subjectId: string | null };
    const lessons: Anchored[] = open.map((i) => {
      const doneAt = finished.get(i.id);
      return {
        id: i.id,
        kind: 'lesson',
        type: i.type,
        title: i.title as LocalizedText,
        subjectId: i.topic.chapter.subjectId,
        subject: subjectName.get(i.topic.chapter.subjectId) ?? null,
        minutes: Math.max(1, minutesOf(i)),
        done: Boolean(doneAt),
        doneDay: doneAt ? nepalDay(doneAt) : null,
        topicId: i.topic.id,
        chapterId: i.topic.chapter.id,
      };
    });

    // Tests of the course the student may take, still to do (or done today); not ones that closed or open too late.
    const listed = (await this.attempts.list({ courseId }, { userId })).data.filter((a) => !a.locked);
    const where = await this.prisma.assessment.findMany({
      where: { id: { in: listed.map((a) => a.id) } },
      select: { id: true, subjectId: true, chapterId: true, topicId: true },
    });
    const anchor = new Map(where.map((a) => [a.id, a]));
    const submitted = new Map<string, Date>();
    for (const t of await this.prisma.attempt.findMany({
      where: {
        userId,
        assessmentId: { in: listed.map((a) => a.id) },
        submittedAt: { not: null },
        status: { not: 'voided' },
      },
      orderBy: { submittedAt: 'asc' },
      select: { assessmentId: true, submittedAt: true },
    })) {
      if (!submitted.has(t.assessmentId)) submitted.set(t.assessmentId, t.submittedAt!);
    }
    const ordered: Anchored[] = [...lessons];
    for (const a of listed) {
      const doneAt = submitted.get(a.id);
      const opensDay = a.state === 'upcoming' && a.opensAt ? nepalDay(new Date(a.opensAt)) : null;
      if (!doneAt && (a.state === 'closed' || (opensDay && opensDay >= examDay))) continue;
      const at = anchor.get(a.id);
      const task: Anchored = {
        id: a.id,
        kind: 'test',
        type: a.type,
        title: a.title,
        subjectId: at?.subjectId ?? null,
        subject: at?.subjectId ? (subjectName.get(at.subjectId) ?? null) : null,
        minutes: Math.max(1, a.durationSeconds ? Math.ceil(a.durationSeconds / 60) : est.testMinutes),
        done: Boolean(doneAt),
        doneDay: doneAt ? nepalDay(doneAt) : null,
        opensDay,
      };
      // After the last lesson of its topic, else chapter, else subject; course-wide tests at the end.
      const after = (match: (l: Anchored) => boolean) =>
        ordered.findLastIndex((l) => l.kind === 'lesson' && match(l));
      let index = -1;
      if (at?.topicId) index = after((l) => l.topicId === at.topicId);
      if (index < 0 && at?.chapterId) index = after((l) => l.chapterId === at.chapterId);
      if (index < 0 && at?.subjectId) index = after((l) => l.subjectId === at.subjectId);
      if (index < 0) ordered.push(task);
      else {
        // Keep tests on the same anchor in list order.
        let at2 = index + 1;
        while (at2 < ordered.length && ordered[at2]!.kind === 'test') at2++;
        ordered.splice(at2, 0, task);
      }
    }
    return ordered;
  }
}

function taskView(t: Task): PlanTaskView {
  return {
    id: t.id,
    kind: t.kind,
    type: t.type,
    title: t.title,
    subjectId: t.subjectId,
    subject: t.subject,
    minutes: t.minutes,
    done: t.done,
  };
}
