import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AssessmentInput,
  type AssessmentListQuery,
  type AssessmentStructureInput,
  type LocalizedText,
  type QuestionPoolFilter,
  type StatusChangeInput,
} from '@tk/contracts';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma, type Assessment } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { assertCanSetStatus, assertSchedule } from '../content/publishing.js';
import { assertCanEditLive, ScopeService, type ContentActor } from '../content/scope.service.js';
import { stemPreview } from '../questions/questions.service.js';
import type { QuestionContent } from '@tk/contracts';

const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));
const json = (v: unknown) => (v ?? Prisma.DbNull) as Prisma.InputJsonValue;

export interface ReadinessProblem {
  section: number | null;
  message: string;
}

/** Published question-bank filter for random sections. */
export function poolWhere(filter: QuestionPoolFilter): Prisma.QuestionWhereInput {
  return {
    deletedAt: null,
    status: 'published',
    subjectId: filter.subjectId,
    ...(filter.topicId
      ? { topicId: filter.topicId }
      : filter.chapterId
        ? { topic: { chapterId: filter.chapterId } }
        : {}),
    ...(filter.difficulty ? { difficulty: filter.difficulty } : {}),
    ...(filter.types?.length ? { type: { in: filter.types } } : {}),
    ...(filter.tags?.length ? { tags: { some: { tag: { name: { in: filter.tags } } } } } : {}),
    ...(filter.pyqOnly ? { isPyq: true } : {}),
  };
}

/** Assessment builder (D-021, D-044). Students take assessments with the attempt engine (§10). */
@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly settings: SettingsService,
  ) {}

  /** Assessments a scoped staff member may see (null = unrestricted). */
  async scopeFilter(actor: ContentActor): Promise<Prisma.AssessmentWhereInput | null> {
    const [subjects, courses] = await Promise.all([
      this.scope.allowedSubjectIds(actor),
      this.scope.allowedCourseIds(actor),
    ]);
    return subjects || courses
      ? { OR: [{ subjectId: { in: [...(subjects ?? [])] } }, { courseId: { in: [...(courses ?? [])] } }] }
      : null;
  }

  async list(query: AssessmentListQuery, actor: ContentActor) {
    const scoped = await this.scopeFilter(actor);
    const rows = await this.prisma.assessment.findMany({
      where: {
        deletedAt: null,
        // AND: the staff scope and the title search are both OR clauses; spreading both would drop the scope.
        AND: [scoped ?? {}],
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.courseId ? { courseId: query.courseId } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { path: ['en'], string_contains: query.q, mode: 'insensitive' } },
                { title: { path: ['ne'], string_contains: query.q } },
              ],
            }
          : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: {
        course: { select: { title: true } },
        subject: { select: { name: true } },
        sections: {
          select: { pickMode: true, questionCount: true, _count: { select: { questions: true } } },
        },
      },
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title as LocalizedText,
        status: a.status,
        publishAt: a.publishAt?.toISOString() ?? null,
        availability: a.availability,
        opensAt: a.opensAt?.toISOString() ?? null,
        closesAt: a.closesAt?.toISOString() ?? null,
        challengeDate: a.challengeDate?.toISOString().slice(0, 10) ?? null,
        course: (a.course?.title as LocalizedText | undefined) ?? null,
        subject: (a.subject?.name as LocalizedText | undefined) ?? null,
        questionCount: a.sections.reduce(
          (n, s) => n + (s.pickMode === 'fixed' ? s._count.questions : (s.questionCount ?? 0)),
          0,
        ),
        updatedAt: a.updatedAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(id: string, actor: ContentActor) {
    const a = await this.findLive(id);
    await this.assertScope(actor, a);
    return this.detail(id);
  }

  async create(input: AssessmentInput, actor: ContentActor) {
    await this.validateLinks(input, actor);
    // Attempt rules left out by the client take the CMS defaults (D-048).
    const defaults = await this.settings.get('assessments.defaults');
    const id = await this.uniqueChallenge(() =>
      this.prisma.$transaction(async (tx) => {
        const a = await tx.assessment.create({
          data: { ...this.data(input, defaults), createdById: actor.userId, updatedById: actor.userId },
        });
        await this.log(tx, actor, 'assessment.create', a.id, {
          after: { type: input.type, title: input.title },
        });
        return a.id;
      }),
    );
    return this.detail(id);
  }

  async update(id: string, input: AssessmentInput, actor: ContentActor) {
    const before = await this.findLive(id);
    await this.assertScope(actor, before);
    assertCanEditLive(actor, before.status, 'assessments:publish');
    if (before.type !== input.type) {
      throw Errors.validation([
        { path: 'type', message: 'The type cannot change; create a new assessment instead' },
      ]);
    }
    await this.validateLinks(input, actor);
    await this.uniqueChallenge(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.assessment.update({
          where: { id },
          data: { ...this.data(input, before), updatedById: actor.userId },
        });
        await this.log(tx, actor, 'assessment.update', id, { after: input });
      }),
    );
    return this.detail(id);
  }

  /** Replaces all sections and their questions. */
  async setStructure(id: string, input: AssessmentStructureInput, actor: ContentActor) {
    const a = await this.findLive(id);
    await this.assertScope(actor, a);
    assertCanEditLive(actor, a.status, 'assessments:publish');
    const ids = input.sections.flatMap((s) =>
      s.pickMode === 'fixed' ? s.questions.map((q) => q.questionId) : [],
    );
    if (ids.length) {
      const found = await this.prisma.question.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, subjectId: true },
      });
      if (found.length !== new Set(ids).size) {
        throw Errors.validation([
          { path: 'sections', message: 'Some questions were not found or were deleted' },
        ]);
      }
      for (const subjectId of new Set(found.map((q) => q.subjectId)))
        await this.scope.assertSubject(actor, subjectId);
    }
    for (const [i, s] of input.sections.entries()) {
      if (s.pickMode !== 'random' || !s.filter) continue;
      await this.scope.assertSubject(actor, s.filter.subjectId);
      const subject = await this.prisma.subject.findFirst({
        where: { id: s.filter.subjectId, deletedAt: null },
      });
      if (!subject)
        throw Errors.validation([{ path: `sections.${i}.filter.subjectId`, message: 'Subject not found' }]);
      if (s.filter.chapterId) {
        const ch = await this.prisma.chapter.findFirst({
          where: { id: s.filter.chapterId, subjectId: s.filter.subjectId, deletedAt: null },
        });
        if (!ch)
          throw Errors.validation([
            { path: `sections.${i}.filter.chapterId`, message: 'Choose a chapter of that subject' },
          ]);
      }
      if (s.filter.topicId) {
        const tp = await this.prisma.topic.findFirst({
          where: { id: s.filter.topicId, chapterId: s.filter.chapterId ?? undefined, deletedAt: null },
        });
        if (!tp)
          throw Errors.validation([
            { path: `sections.${i}.filter.topicId`, message: 'Choose a topic of that chapter' },
          ]);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentSection.deleteMany({ where: { assessmentId: id } });
      for (const [i, s] of input.sections.entries()) {
        const section = await tx.assessmentSection.create({
          data: {
            assessmentId: id,
            title: json(s.title),
            sortOrder: i,
            pickMode: s.pickMode,
            filter: s.pickMode === 'random' ? json(s.filter) : Prisma.DbNull,
            questionCount: s.pickMode === 'random' ? (s.questionCount ?? null) : null,
            marksPerQuestion: s.marksPerQuestion ?? null,
            negativeMarksPerQuestion: s.negativeMarksPerQuestion ?? null,
          },
        });
        if (s.pickMode === 'fixed') {
          await tx.assessmentQuestion.createMany({
            data: s.questions.map((q, j) => ({
              assessmentId: id,
              sectionId: section.id,
              questionId: q.questionId,
              sortOrder: j,
              marks: q.marks ?? null,
              negativeMarks: q.negativeMarks ?? null,
            })),
          });
        }
      }
      await tx.assessment.update({ where: { id }, data: { updatedById: actor.userId } });
      await this.log(tx, actor, 'assessment.structure', id, {
        sections: input.sections.map((s) => ({
          pickMode: s.pickMode,
          count: s.pickMode === 'fixed' ? s.questions.length : s.questionCount,
        })),
      });
    });
    return this.detail(id);
  }

  /** What still blocks publishing, plus totals. Random sections are checked against published questions. */
  async readiness(id: string) {
    const a = await this.prisma.assessment.findUniqueOrThrow({
      where: { id },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            questions: {
              include: {
                question: { select: { status: true, deletedAt: true, type: true, defaultMarks: true } },
              },
            },
          },
        },
      },
    });
    const problems: ReadinessProblem[] = [];
    const warnings: ReadinessProblem[] = [];
    let questions = 0;
    let minMarks = 0;
    let maxMarks = 0;
    let hasSubjective = false;
    if (!a.sections.length)
      problems.push({ section: null, message: 'Add at least one section with questions' });
    for (const [i, s] of a.sections.entries()) {
      const n = i + 1;
      const sectionMarks = num(s.marksPerQuestion);
      if (s.pickMode === 'fixed') {
        questions += s.questions.length;
        const unpublished = s.questions.filter(
          (q) => q.question.deletedAt || q.question.status !== 'published',
        ).length;
        if (unpublished) {
          problems.push({
            section: n,
            message: `${unpublished} question(s) are not published (or were deleted)`,
          });
        }
        if (s.questions.some((q) => q.question.type === 'subjective')) hasSubjective = true;
        const marks = s.questions.reduce(
          (sum, q) => sum + (num(q.marks) ?? sectionMarks ?? Number(q.question.defaultMarks)),
          0,
        );
        minMarks += marks;
        maxMarks += marks;
      } else {
        const filter = s.filter as unknown as QuestionPoolFilter;
        const count = s.questionCount ?? 0;
        questions += count;
        const where = poolWhere(filter);
        const [available, subjective, agg] = await Promise.all([
          this.prisma.question.count({ where }),
          // Both conditions: spreading `type` would replace the pool's own type filter (e.g. objective types only).
          this.prisma.question.count({ where: { AND: [where, { type: 'subjective' }] } }),
          this.prisma.question.aggregate({
            where,
            _min: { defaultMarks: true },
            _max: { defaultMarks: true },
          }),
        ]);
        if (available < count) {
          problems.push({
            section: n,
            message: `Needs ${count} questions but only ${available} published questions match`,
          });
        }
        if (subjective) hasSubjective = true;
        if (sectionMarks !== null) {
          minMarks += sectionMarks * count;
          maxMarks += sectionMarks * count;
        } else {
          const lo = num(agg._min.defaultMarks) ?? 0;
          const hi = num(agg._max.defaultMarks) ?? 0;
          minMarks += lo * count;
          maxMarks += hi * count;
          if (lo !== hi) {
            warnings.push({
              section: n,
              message:
                'Questions in this pool have different marks, so totals can differ between students. Set marks per question to make them equal.',
            });
          }
        }
      }
    }
    if (hasSubjective && a.subjectiveGrading === 'none') {
      problems.push({
        section: null,
        message: 'There are written (subjective) questions: choose self-evaluation or instructor grading',
      });
    }
    const pass = num(a.passMarks);
    if (pass !== null && pass > minMarks && questions > 0) {
      problems.push({
        section: null,
        message: `Pass marks (${pass}) are higher than the total marks (${minMarks})`,
      });
    }
    if (a.availability === 'window' && a.closesAt && a.closesAt <= new Date()) {
      warnings.push({ section: null, message: 'The availability window has already closed' });
    }
    return {
      ready: problems.length === 0,
      questions,
      totalMarks: { min: round(minMarks), max: round(maxMarks) },
      problems,
      warnings,
    };
  }

  async setStatus(id: string, change: StatusChangeInput, actor: ContentActor) {
    assertCanSetStatus(actor.access, change.status, 'assessments:publish');
    const a = await this.findLive(id);
    await this.assertScope(actor, a);
    const publishAt = change.status === 'scheduled' && change.publishAt ? new Date(change.publishAt) : null;
    assertSchedule(change.status, publishAt);
    if (change.status === 'published' || change.status === 'scheduled') {
      const report = await this.readiness(id);
      if (!report.ready) {
        throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'This assessment is not ready to publish', {
          problems: report.problems,
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.assessment.update({
        where: { id },
        data: {
          status: change.status,
          publishAt: change.status === 'published' ? new Date() : publishAt,
          updatedById: actor.userId,
        },
      });
      await this.log(tx, actor, 'assessment.status', id, {
        before: a.status,
        after: change.status,
        publishAt,
      });
    });
  }

  async remove(id: string, actor: ContentActor) {
    assertCanSetStatus(actor.access, 'archived', 'assessments:publish');
    const a = await this.findLive(id);
    await this.assertScope(actor, a);
    await this.prisma.$transaction(async (tx) => {
      await tx.assessment.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: actor.userId },
      });
      await this.log(tx, actor, 'assessment.delete', id, {});
    });
  }

  // ───────────── helpers ─────────────

  /** `fallback`: the CMS defaults for a new assessment, or the current values when an update leaves them out. */
  private data(
    input: AssessmentInput,
    fallback: Pick<Assessment, 'premiumAccess' | 'lateStart' | 'countedAttempt'>,
  ) {
    return {
      type: input.type,
      title: input.title,
      instructions: json(input.instructions),
      courseId: input.courseId ?? null,
      subjectId: input.subjectId ?? null,
      chapterId: input.chapterId ?? null,
      topicId: input.topicId ?? null,
      examNodeId: input.examNodeId ?? null,
      accessLevel: input.accessLevel,
      availability: input.availability,
      opensAt: input.availability === 'window' && input.opensAt ? new Date(input.opensAt) : null,
      closesAt: input.availability === 'window' && input.closesAt ? new Date(input.closesAt) : null,
      durationSeconds: input.durationMinutes ? input.durationMinutes * 60 : null,
      maxAttempts: input.maxAttempts,
      passMarks: input.passMarks,
      scoring: input.scoring as Prisma.InputJsonValue,
      shuffleQuestions: input.shuffleQuestions,
      shuffleOptions: input.shuffleOptions,
      resultRelease: input.resultRelease,
      showExplanations: input.showExplanations,
      leaderboardEnabled: input.leaderboardEnabled,
      subjectiveGrading: input.subjectiveGrading,
      premiumAccess: input.premiumAccess ?? fallback.premiumAccess,
      lateStart: input.lateStart ?? fallback.lateStart,
      countedAttempt: input.countedAttempt ?? fallback.countedAttempt,
      challengeDate: input.challengeDate ? new Date(`${input.challengeDate}T00:00:00Z`) : null,
    };
  }

  private async validateLinks(input: AssessmentInput, actor: ContentActor) {
    const check = async (ok: unknown, path: string, message: string) => {
      if (!(await ok)) throw Errors.validation([{ path, message }]);
    };
    if (input.courseId) {
      await check(
        this.prisma.course.findFirst({ where: { id: input.courseId, deletedAt: null } }),
        'courseId',
        'Course not found',
      );
      await this.scope.assertCourse(actor, input.courseId);
    }
    if (input.subjectId) {
      await check(
        this.prisma.subject.findFirst({ where: { id: input.subjectId, deletedAt: null } }),
        'subjectId',
        'Subject not found',
      );
      await this.scope.assertSubject(actor, input.subjectId);
    }
    if (input.chapterId) {
      await check(
        this.prisma.chapter.findFirst({
          where: { id: input.chapterId, subjectId: input.subjectId ?? undefined, deletedAt: null },
        }),
        'chapterId',
        'Choose a chapter of the selected subject',
      );
    }
    if (input.topicId) {
      await check(
        this.prisma.topic.findFirst({
          where: { id: input.topicId, chapterId: input.chapterId ?? undefined, deletedAt: null },
        }),
        'topicId',
        'Choose a topic of the selected chapter',
      );
    }
    if (input.examNodeId) {
      await check(
        this.prisma.examNode.findFirst({ where: { id: input.examNodeId, deletedAt: null } }),
        'examNodeId',
        'Exam category not found',
      );
    }
    if (!input.courseId && !input.subjectId) await this.scope.assertUnscoped(actor);
  }

  /** Staff limited to some courses/subjects may only work on assessments inside them. */
  async assertScope(actor: ContentActor, a: Assessment) {
    if (a.subjectId) await this.scope.assertSubject(actor, a.subjectId);
    else if (a.courseId) await this.scope.assertCourse(actor, a.courseId);
    else await this.scope.assertUnscoped(actor);
  }

  private async uniqueChallenge<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(409, ErrorCode.CONFLICT, 'There is already a daily challenge on this day', {
          field: 'challengeDate',
        });
      }
      throw err;
    }
  }

  private async detail(id: string) {
    const a = await this.prisma.assessment.findUniqueOrThrow({
      where: { id },
      include: {
        course: { select: { id: true, title: true } },
        subject: { select: { id: true, name: true } },
        chapter: { select: { id: true, title: true } },
        topic: { select: { id: true, title: true } },
        examNode: { select: { id: true, name: true } },
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            questions: {
              orderBy: { sortOrder: 'asc' },
              include: {
                question: {
                  select: {
                    id: true,
                    type: true,
                    status: true,
                    difficulty: true,
                    deletedAt: true,
                    defaultMarks: true,
                    defaultNegativeMarks: true,
                    currentVersion: { select: { content: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return {
      id: a.id,
      type: a.type,
      title: a.title as LocalizedText,
      instructions: a.instructions ?? null,
      course: a.course ? { id: a.course.id, title: a.course.title as LocalizedText } : null,
      subject: a.subject ? { id: a.subject.id, name: a.subject.name as LocalizedText } : null,
      chapter: a.chapter ? { id: a.chapter.id, title: a.chapter.title as LocalizedText } : null,
      topic: a.topic ? { id: a.topic.id, title: a.topic.title as LocalizedText } : null,
      examNode: a.examNode ? { id: a.examNode.id, name: a.examNode.name as LocalizedText } : null,
      accessLevel: a.accessLevel,
      availability: a.availability,
      opensAt: a.opensAt?.toISOString() ?? null,
      closesAt: a.closesAt?.toISOString() ?? null,
      durationMinutes: a.durationSeconds ? Math.round(a.durationSeconds / 60) : null,
      maxAttempts: a.maxAttempts,
      passMarks: num(a.passMarks),
      scoring: a.scoring,
      shuffleQuestions: a.shuffleQuestions,
      shuffleOptions: a.shuffleOptions,
      resultRelease: a.resultRelease,
      showExplanations: a.showExplanations,
      leaderboardEnabled: a.leaderboardEnabled,
      subjectiveGrading: a.subjectiveGrading,
      premiumAccess: a.premiumAccess,
      lateStart: a.lateStart,
      countedAttempt: a.countedAttempt,
      challengeDate: a.challengeDate?.toISOString().slice(0, 10) ?? null,
      status: a.status,
      publishAt: a.publishAt?.toISOString() ?? null,
      updatedAt: a.updatedAt.toISOString(),
      sections: a.sections.map((s) => ({
        id: s.id,
        title: (s.title as LocalizedText | null) ?? null,
        pickMode: s.pickMode,
        filter: (s.filter as QuestionPoolFilter | null) ?? null,
        questionCount: s.questionCount,
        marksPerQuestion: num(s.marksPerQuestion),
        negativeMarksPerQuestion: num(s.negativeMarksPerQuestion),
        questions: s.questions.map((q) => ({
          questionId: q.questionId,
          type: q.question.type,
          status: q.question.deletedAt ? 'deleted' : q.question.status,
          difficulty: q.question.difficulty,
          preview: stemPreview(q.question.currentVersion?.content as QuestionContent | undefined),
          defaultMarks: Number(q.question.defaultMarks),
          defaultNegativeMarks: Number(q.question.defaultNegativeMarks),
          marks: num(q.marks),
          negativeMarks: num(q.negativeMarks),
        })),
      })),
      readiness: await this.readiness(id),
    };
  }

  private async findLive(id: string): Promise<Assessment> {
    const a = await this.prisma.assessment.findFirst({ where: { id, deletedAt: null } });
    if (!a) throw Errors.notFound('Assessment');
    return a;
  }

  private log(
    tx: Prisma.TransactionClient,
    actor: ContentActor,
    action: string,
    id: string,
    changes: object,
  ) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType: 'assessment',
        entityId: id,
        changes,
        client: actor.client,
      },
      tx,
    );
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
