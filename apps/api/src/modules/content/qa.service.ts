import { Injectable } from '@nestjs/common';
import {
  richDocMediaIds,
  richDocText,
  type LocalizedRichDoc,
  type LocalizedText,
  type QuestionContent,
} from '@tk/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import { MediaService } from '../media/media.service.js';
import { CoursesService } from './courses.service.js';
import { LearningItemsService } from './learning-items.service.js';
import { mediaIdsIn, splitQuestion } from './practice-view.js';
import type { ContentActor } from './scope.service.js';

/** One line of a content QA checklist: `required` ones stop students from using it; the rest are recommended. */
export interface CheckItem {
  key: string;
  ok: boolean;
  required: boolean;
  label: string;
}

const LIVE = { in: ['published' as const, 'scheduled' as const] };

const hasText = (t: LocalizedText | null | undefined, l: 'en' | 'ne') => Boolean(t?.[l]?.trim());
const hasDoc = (doc: unknown) =>
  Boolean(doc) && (richDocText(doc).trim() !== '' || richDocMediaIds(doc).length > 0);

const bilingual = (key: string, what: string, text: LocalizedText | null | undefined): CheckItem[] => [
  { key: `${key}_en`, ok: hasText(text, 'en'), required: false, label: `${what} in English` },
  { key: `${key}_ne`, ok: hasText(text, 'ne'), required: false, label: `${what} in Nepali` },
];

/**
 * Content QA (S23, D-075 / audit F-04): a checklist before publishing lessons and courses, and a student's-eye
 * preview of a test. Access is checked by the services that load the content (staff scopes apply).
 */
@Injectable()
export class QaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: LearningItemsService,
    private readonly courses: CoursesService,
    private readonly assessments: AssessmentsService,
    private readonly media: MediaService,
  ) {}

  async itemChecklist(id: string, actor: ContentActor) {
    const item = await this.items.get(id, actor);
    const checks: CheckItem[] = [...bilingual('title', 'Title', item.title)];
    if (item.type === 'note') {
      const doc = item.noteContent as LocalizedRichDoc | null;
      checks.push(
        { key: 'body', ok: hasDoc(doc?.en) || hasDoc(doc?.ne), required: true, label: 'The note has text' },
        { key: 'body_en', ok: hasDoc(doc?.en), required: false, label: 'Note text in English' },
        { key: 'body_ne', ok: hasDoc(doc?.ne), required: false, label: 'Note text in Nepali' },
      );
    } else if (item.type === 'pdf') {
      checks.push({ key: 'pdf', ok: Boolean(item.pdf), required: true, label: 'A PDF is attached' });
    } else {
      checks.push(
        { key: 'video', ok: Boolean(item.video), required: true, label: 'A video is linked' },
        {
          key: 'video_ready',
          ok: item.video?.status === 'ready',
          required: true,
          label: 'The video has finished processing',
        },
        { key: 'duration', ok: Boolean(item.durationSeconds), required: false, label: 'Length is set' },
      );
    }
    const topic = await this.prisma.topic.findUniqueOrThrow({
      where: { id: item.topicId },
      select: {
        status: true,
        chapter: { select: { status: true, subjectId: true, subject: { select: { status: true } } } },
      },
    });
    const live = (s: string) => s === 'published' || s === 'scheduled';
    const courses = await this.prisma.courseSubject.count({
      where: { subjectId: topic.chapter.subjectId, course: { deletedAt: null, status: LIVE } },
    });
    checks.push(
      {
        key: 'path_published',
        ok: live(topic.status) && live(topic.chapter.status) && live(topic.chapter.subject.status),
        required: true,
        label: 'Its subject, chapter and topic are published',
      },
      {
        key: 'in_course',
        ok: courses > 0,
        required: false,
        label: 'Its subject is in a published course',
      },
    );
    return this.result(checks);
  }

  async courseChecklist(id: string, actor: ContentActor) {
    await this.courses.get(id, actor);
    const c = await this.prisma.course.findUniqueOrThrow({
      where: { id },
      select: {
        title: true,
        shortDescription: true,
        description: true,
        thumbnailMediaId: true,
        pricePaisa: true,
        subjects: { select: { subjectId: true } },
        _count: { select: { examNodes: true, instructors: true } },
      },
    });
    const subjectIds = c.subjects.map((s) => s.subjectId);
    const lessons = subjectIds.length
      ? await this.prisma.learningItem.count({
          where: {
            deletedAt: null,
            status: LIVE,
            topic: {
              deletedAt: null,
              status: LIVE,
              chapter: { deletedAt: null, status: LIVE, subjectId: { in: subjectIds } },
            },
          },
        })
      : 0;
    const description = c.description as LocalizedRichDoc | null;
    return this.result([
      ...bilingual('title', 'Title', c.title as LocalizedText),
      ...bilingual('summary', 'Short description', c.shortDescription as LocalizedText | null),
      {
        key: 'description',
        ok: hasDoc(description?.en) || hasDoc(description?.ne),
        required: false,
        label: 'Full description',
      },
      { key: 'cover', ok: Boolean(c.thumbnailMediaId), required: false, label: 'Cover picture' },
      { key: 'subjects', ok: subjectIds.length > 0, required: true, label: 'At least one subject' },
      { key: 'lessons', ok: lessons > 0, required: true, label: 'Published lessons in its subjects' },
      {
        key: 'exams',
        ok: c._count.examNodes > 0,
        required: false,
        label: 'Linked to the exams it prepares for',
      },
      { key: 'instructors', ok: c._count.instructors > 0, required: false, label: 'Instructors listed' },
      {
        key: 'price',
        ok: c.pricePaisa > 0,
        required: false,
        label:
          c.pricePaisa > 0
            ? 'Has a price'
            : 'The price is Rs 0 — the course is free. Check that this is intended',
      },
    ]);
  }

  /**
   * A test as a student sees it: instructions and each fixed question without its answer key or explanation
   * (random sections say how many questions are drawn). Staff with access to the test may look.
   */
  async assessmentPreview(id: string, actor: ContentActor) {
    const a = await this.assessments.get(id, actor);
    const rows = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId: id },
      orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      select: {
        sectionId: true,
        questionId: true,
        question: { select: { currentVersion: { select: { content: true } } } },
      },
    });
    const content = new Map(
      rows.map((r) => [r.questionId, r.question.currentVersion?.content as QuestionContent | undefined]),
    );
    const mediaIds = new Set<string>();
    let number = 0;
    const sections = a.sections.map((s) => ({
      id: s.id,
      title: s.title,
      pickMode: s.pickMode,
      questionCount: s.pickMode === 'random' ? s.questionCount : s.questions.length,
      questions:
        s.pickMode === 'random'
          ? []
          : s.questions.flatMap((q) => {
              const stored = content.get(q.questionId);
              if (!stored) return [];
              const { question } = splitQuestion(stored);
              mediaIdsIn(question, mediaIds);
              number += 1;
              return [
                {
                  number,
                  questionId: q.questionId,
                  marks: q.marks ?? s.marksPerQuestion ?? q.defaultMarks,
                  question,
                },
              ];
            }),
    }));
    return {
      id: a.id,
      title: a.title,
      instructions: a.instructions,
      accessLevel: a.accessLevel,
      durationMinutes: a.durationMinutes,
      totalMarks: a.readiness.totalMarks,
      sections,
      media: await this.media.publicImageUrls([...mediaIds]),
    };
  }

  private result(checks: CheckItem[]) {
    return { ready: checks.every((c) => c.ok || !c.required), checks };
  }
}
