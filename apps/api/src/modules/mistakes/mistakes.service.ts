import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type LocalizedText,
  type MistakeReviewInput,
  type MistakesQuery,
  type PracticeCheckInput,
  type QuestionContent,
} from '@tk/contracts';
import {
  isMistake,
  practiceOutcome,
  recordMistake,
  resultsReleased,
  reviewMistake,
  type AnswerKey,
  type AnswerResponse,
  type MistakeState,
  type Outcome,
} from '@tk/domain';
import { AppError, Errors } from '../../common/errors/app-error.js';
import type { Mistake, MistakeSource } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { CatalogService, type Viewer } from '../content/catalog.service.js';
import { EntitlementsService } from '../content/entitlements.service.js';
import { mediaIdsIn, splitQuestion } from '../content/practice-view.js';
import {
  PracticeService,
  questionInclude,
  visibleQuestion,
  type QuestionRow,
} from '../content/practice.service.js';
import { MediaService } from '../media/media.service.js';
import { SettingsService } from '../settings/settings.service.js';

const locked = () => new AppError(403, ErrorCode.CONTENT_LOCKED, 'This question needs access to its course');
const notInNotebook = () => Errors.notFound('Question in your mistake notebook');

const stateOf = (m: Mistake): MistakeState => ({
  status: m.status,
  timesWrong: m.timesWrong,
  correctStreak: m.correctStreak,
  lastWrongAt: m.lastWrongAt,
  lastReviewedAt: m.lastReviewedAt,
  masteredAt: m.masteredAt,
});

/**
 * The mistake notebook (D-050, T-047). Wrong and partly correct answers come from practice (recorded and scored on
 * the server as they are checked) and from tests: a test's answers join only once the attempt is completed and its
 * results are released, so the notebook never reveals unreleased results; that sync runs whenever the notebook is
 * read. Revision: N correct answers in a row (CMS setting) master a question; the student can also remove it.
 */
@Injectable()
export class MistakesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly entitlements: EntitlementsService,
    private readonly practice: PracticeService,
    private readonly media: MediaService,
    private readonly settings: SettingsService,
  ) {}

  // ───────────── Recording ─────────────

  /** A checked practice answer: scored here; a mistake goes into the notebook. Written answers are self-reviewed. */
  async checkPractice(questionId: string, input: PracticeCheckInput, viewer: Viewer) {
    await this.catalog.assertVerifiedForLearning(viewer);
    const q = await this.visible(questionId);
    if (!(await this.canSee(q, viewer.userId, false))) throw locked();
    const outcome = this.score(q, input.response);
    if (isMistake(outcome)) {
      await this.prisma.$transaction((tx) =>
        this.record(tx, viewer.userId, q.id, new Date(), 'practice', false),
      );
    }
    return { outcome, addedToNotebook: isMistake(outcome) };
  }

  /** Adds the mistakes of the student's completed attempts whose results are now released (once per attempt). */
  async syncFromTests(userId: string, now = new Date()): Promise<void> {
    const attempts = await this.prisma.attempt.findMany({
      where: { userId, status: 'completed', mistakesSyncedAt: null },
      include: { assessment: true },
      orderBy: { submittedAt: 'asc' },
      take: 100,
    });
    for (const attempt of attempts) {
      if (!resultsReleased(attempt.assessment, now)) continue;
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.attempt.updateMany({
          where: { id: attempt.id, mistakesSyncedAt: null },
          data: { mistakesSyncedAt: now },
        });
        if (!claimed.count) return;
        const wrong = await tx.attemptAnswer.findMany({
          where: { attemptId: attempt.id, outcome: { in: ['wrong', 'partial'] } },
          select: { questionId: true },
        });
        for (const { questionId } of wrong) {
          // Students who saw the released solutions keep seeing the answer here, whatever their course access.
          await this.record(
            tx,
            userId,
            questionId,
            attempt.submittedAt ?? now,
            'test',
            attempt.assessment.showExplanations,
          );
        }
      });
    }
  }

  // ───────────── Reading ─────────────

  async list(query: MistakesQuery, viewer: Viewer) {
    await this.catalog.assertVerifiedForLearning(viewer);
    await this.syncFromTests(viewer.userId);
    const [lastWrongAt, afterId] = this.decodeCursor(query.cursor);
    const rows = await this.prisma.mistake.findMany({
      where: {
        userId: viewer.userId,
        status: 'active',
        question: { ...visibleQuestion, ...(query.subjectId ? { subjectId: query.subjectId } : {}) },
        ...(lastWrongAt
          ? {
              OR: [
                { lastWrongAt: { lt: lastWrongAt } },
                { lastWrongAt, questionId: { gt: afterId as string } },
              ],
            }
          : {}),
      },
      include: { question: { include: { ...questionInclude, subject: true } } },
      orderBy: [{ lastWrongAt: 'desc' }, { questionId: 'asc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const access = await this.subjectAccess(
      viewer.userId,
      page.map((m) => m.question.subjectId),
    );
    const data = page.map((m) => ({
      questionId: m.questionId,
      timesWrong: m.timesWrong,
      correctStreak: m.correctStreak,
      lastWrongAt: m.lastWrongAt.toISOString(),
      lastSource: m.lastSource,
      subject: { id: m.question.subject.id, name: m.question.subject.name as LocalizedText },
      question: this.practice.view(m.question, m.answerVisible || access.has(m.question.subjectId)),
    }));
    const last = page.at(-1);
    return {
      data,
      nextCursor:
        rows.length > query.limit && last ? `${last.lastWrongAt.toISOString()}|${last.questionId}` : null,
      required: (await this.settings.get('mistakes.revision')).correctInARow,
      media: await this.media.publicImageUrls([...mediaIdsIn(data.map((d) => d.question))]),
    };
  }

  /** Counts for Profile / Home: questions to revise (by subject) and mastered. */
  async summary(viewer: Viewer) {
    await this.syncFromTests(viewer.userId);
    const rows = await this.prisma.mistake.findMany({
      where: { userId: viewer.userId, status: { in: ['active', 'mastered'] }, question: visibleQuestion },
      select: { status: true, question: { select: { subject: { select: { id: true, name: true } } } } },
    });
    const bySubject = new Map<string, { id: string; name: LocalizedText; count: number }>();
    for (const r of rows) {
      if (r.status !== 'active') continue;
      const s = r.question.subject;
      const entry = bySubject.get(s.id) ?? { id: s.id, name: s.name as LocalizedText, count: 0 };
      entry.count += 1;
      bySubject.set(s.id, entry);
    }
    return {
      active: rows.filter((r) => r.status === 'active').length,
      mastered: rows.filter((r) => r.status === 'mastered').length,
      required: (await this.settings.get('mistakes.revision')).correctInARow,
      subjects: [...bySubject.values()].sort((a, b) => b.count - a.count),
    };
  }

  // ───────────── Revision ─────────────

  async review(questionId: string, input: MistakeReviewInput, viewer: Viewer) {
    await this.catalog.assertVerifiedForLearning(viewer);
    const mistake = await this.prisma.mistake.findUnique({
      where: { userId_questionId: { userId: viewer.userId, questionId } },
    });
    if (!mistake || mistake.status !== 'active') throw notInNotebook();
    const q = await this.visible(questionId).catch(() => {
      throw notInNotebook();
    });
    if (!(await this.canSee(q, viewer.userId, mistake.answerVisible))) throw locked();

    const content = q.currentVersion!.content as QuestionContent;
    let outcome: Outcome;
    if (content.type === 'subjective') {
      if (!('selfCorrect' in input)) {
        throw Errors.validation([
          { path: 'selfCorrect', message: 'Written answers are reviewed against the model answer' },
        ]);
      }
      outcome = input.selfCorrect ? 'correct' : 'wrong';
    } else {
      if (!('response' in input)) {
        throw Errors.validation([{ path: 'response', message: 'Answer the question' }]);
      }
      outcome = this.score(q, input.response);
      if (outcome === 'skipped')
        throw Errors.validation([{ path: 'response', message: 'Answer the question' }]);
    }

    const { correctInARow } = await this.settings.get('mistakes.revision');
    const next = reviewMistake(stateOf(mistake), outcome === 'correct', new Date(), correctInARow);
    await this.prisma.mistake.update({
      where: { userId_questionId: { userId: viewer.userId, questionId } },
      data: { ...next },
    });
    return {
      outcome,
      correctStreak: next.correctStreak,
      required: correctInARow,
      mastered: next.status === 'mastered',
    };
  }

  /** The student takes a question out of the notebook; a later mistake brings it back. */
  async remove(questionId: string, viewer: Viewer) {
    const removed = await this.prisma.mistake.updateMany({
      where: { userId: viewer.userId, questionId, status: 'active' },
      data: { status: 'removed', correctStreak: 0 },
    });
    if (!removed.count) throw notInNotebook();
  }

  // ───────────── helpers ─────────────

  private async record(
    tx: Tx,
    userId: string,
    questionId: string,
    at: Date,
    source: MistakeSource,
    answerVisible: boolean,
  ) {
    const key = { userId_questionId: { userId, questionId } };
    const prev = await tx.mistake.findUnique({ where: key });
    const next = recordMistake(prev ? stateOf(prev) : null, at);
    await tx.mistake.upsert({
      where: key,
      create: { userId, questionId, ...next, lastSource: source, answerVisible },
      update: {
        ...next,
        // The latest mistake decides the source shown; an older one (released late) does not.
        ...(next.lastWrongAt.getTime() === at.getTime() ? { lastSource: source } : {}),
        ...(answerVisible ? { answerVisible: true } : {}),
      },
    });
  }

  private async visible(questionId: string): Promise<QuestionRow> {
    const q = await this.prisma.question.findFirst({
      where: { ...visibleQuestion, id: questionId },
      include: questionInclude,
    });
    if (!q) throw Errors.notFound('Question');
    return q;
  }

  /** Free questions, or the student has access to the subject, or already saw the solution in a released test. */
  private async canSee(q: QuestionRow, userId: string, answerVisible: boolean): Promise<boolean> {
    return (
      q.accessLevel === 'free' ||
      answerVisible ||
      (await this.entitlements.hasSubjectAccess(userId, q.subjectId))
    );
  }

  private async subjectAccess(userId: string, subjectIds: string[]): Promise<Set<string>> {
    const unique = [...new Set(subjectIds)];
    const flags = await Promise.all(unique.map((id) => this.entitlements.hasSubjectAccess(userId, id)));
    return new Set(unique.filter((_, i) => flags[i]));
  }

  private score(q: QuestionRow, response: PracticeCheckInput['response']): Outcome {
    const content = q.currentVersion!.content as QuestionContent;
    if (content.type === 'subjective') {
      throw Errors.validation([
        { path: 'response', message: 'Written answers are self-reviewed, not checked' },
      ]);
    }
    if (response.type !== content.type) {
      throw Errors.validation([{ path: 'response.type', message: `This is a ${content.type} question` }]);
    }
    const { answer } = splitQuestion(content);
    return practiceOutcome(answer as unknown as AnswerKey, response as AnswerResponse);
  }

  private decodeCursor(cursor: string | undefined): [Date | null, string | null] {
    if (!cursor) return [null, null];
    const [iso, id] = cursor.split('|');
    const at = new Date(iso ?? '');
    if (Number.isNaN(at.getTime()) || !id || !/^[0-9a-f-]{36}$/.test(id)) {
      throw Errors.validation([{ path: 'cursor', message: 'Invalid cursor' }]);
    }
    return [at, id];
  }
}
