import {
  ArticleInput,
  AssessmentInput,
  AssessmentStructureInput,
  ChapterInput,
  CouponInput,
  CourseInput,
  CourseLinksInput,
  CoursePricingInput,
  CourseSubjectsInput,
  ExamNodeInput,
  ExamNodeTypeInput,
  LearningItemInput,
  NoticeInput,
  PlanCoursesInput,
  PlanInput,
  PlanPricingInput,
  QuestionInput,
  SubjectInput,
  TopicInput,
} from '@tk/contracts';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  articles,
  categories,
  categoryTypes,
  coupons,
  notices,
  plans,
  testRules,
} from './content/catalog.ts';
import { plainText, md } from './markdown.ts';
import { courses, handoutFor } from './pack.ts';
import {
  articleBody,
  chapterAccess,
  chapterBody,
  courseBody,
  courseLinksBody,
  coursePricingBody,
  courseSubjectsBody,
  examNodeBody,
  examNodeTypeBody,
  keyPointsTitle,
  noteBody,
  noticeBody,
  objectiveQuestions,
  pdfBody,
  planBody,
  planPricingBody,
  questionBody,
  quizBody,
  quizStructure,
  revisionTopic,
  subjectBody,
  subjectTestBody,
  subjectTestStructure,
  topicBody,
} from './payloads.ts';
import { renderHandout, unsupportedChars } from './pdf.ts';

const ID = '00000000-0000-7000-8000-000000000001';

/** Parses like the API does, and reports the issues readably when it fails. */
function valid(schema: z.ZodType, value: unknown, what: string) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `${what}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
}

describe('university content pack (D-071)', () => {
  it('has the agreed shape: categories, five courses, two plans, two coupons, notices and articles', () => {
    expect(courses.map((c) => c.slug)).toEqual([
      'operating-systems',
      'software-engineering',
      'deep-learning',
      'introductory-biology',
      'introduction-to-multimedia',
    ]);
    expect(categoryTypes.map((t) => t.key)).toEqual(['university', 'program', 'semester']);
    expect(plans.map((p) => p.slug)).toEqual(['cse-semester-pack', 'all-access']);
    expect(coupons.map((c) => c.code)).toEqual(['WELCOME20', 'STUDY100']);
    expect(notices.length).toBeGreaterThanOrEqual(3);
    expect(articles.length).toBeGreaterThanOrEqual(3);
    // Keys are unique across the whole pack (the importer remembers ids by key).
    const keys = courses.flatMap((c) => [
      c.key,
      c.subject.key,
      ...c.chapters.flatMap((ch) => [ch.key, ...ch.topics.map((t) => t.key)]),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('builds category, plan, coupon, notice and article bodies the API accepts', () => {
    for (const t of categoryTypes) valid(ExamNodeTypeInput, examNodeTypeBody(t), `type ${t.key}`);
    for (const c of categories) {
      valid(ExamNodeInput, examNodeBody(c, c.parent ? ID : null), `category ${c.key}`);
      if (c.parent) expect(categories.some((p) => p.key === c.parent)).toBe(true);
      // A child's type ranks below its parent's.
      const parent = categories.find((p) => p.key === c.parent);
      if (parent) {
        const rank = (key: string) => categoryTypes.find((t) => t.key === key)!.rank;
        expect(rank(c.type)).toBeGreaterThan(rank(parent.type));
      }
    }
    for (const p of plans) {
      valid(PlanInput, planBody(p), `plan ${p.slug}`);
      valid(PlanPricingInput, planPricingBody(p), `plan pricing ${p.slug}`);
      valid(PlanCoursesInput, { courseIds: p.courses.map(() => ID) }, `plan courses ${p.slug}`);
      for (const key of p.courses) expect(courses.some((c) => c.key === key)).toBe(true);
    }
    for (const c of coupons) valid(CouponInput, c, `coupon ${c.code}`);
    for (const n of notices) valid(NoticeInput, noticeBody(n), `notice ${n.key}`);
    for (const a of articles) valid(ArticleInput, articleBody(a), `article ${a.slug}`);
  });

  for (const course of courses) {
    describe(course.title.en, () => {
      it('builds course, subject, chapter, topic and lesson bodies the API accepts', () => {
        valid(CourseInput, courseBody(course), 'course');
        valid(CoursePricingInput, coursePricingBody(), 'pricing');
        valid(CourseSubjectsInput, courseSubjectsBody(ID), 'course subjects');
        valid(CourseLinksInput, courseLinksBody([ID]), 'course links');
        valid(SubjectInput, subjectBody(course), 'subject');
        expect(categories.some((c) => c.key === course.semester)).toBe(true);
        for (const chapter of course.chapters) {
          valid(ChapterInput, chapterBody(chapter), `chapter ${chapter.key}`);
          const access = chapterAccess(course, chapter);
          chapter.topics.forEach((topic, i) => {
            valid(TopicInput, topicBody(topic, `${chapter.numberLabel}.${i + 1}`), `topic ${topic.key}`);
            valid(LearningItemInput, noteBody(topic.title, topic.note, access), `note ${topic.key}`);
          });
          const revision = revisionTopic(chapter);
          valid(TopicInput, topicBody(revision, revision.numberLabel), `revision topic ${chapter.key}`);
          valid(
            LearningItemInput,
            noteBody(keyPointsTitle(chapter), chapter.revision, access),
            `key points ${chapter.key}`,
          );
          valid(LearningItemInput, pdfBody(chapter, ID, access), `pdf ${chapter.key}`);
        }
        // The first chapter is free; the rest premium.
        expect(course.chapters.map((ch) => chapterAccess(course, ch))).toEqual(
          course.chapters.map((_, i) => (i === 0 ? 'free' : 'premium')),
        );
      });

      it('has a valid question bank, quizzes and subject test', () => {
        for (const chapter of course.chapters) {
          for (const topic of chapter.topics) {
            expect(topic.questions.length, `${topic.key} has questions`).toBeGreaterThanOrEqual(3);
            topic.questions.forEach((q, i) =>
              valid(
                QuestionInput,
                questionBody(course, chapter, q, { subjectId: ID, topicId: ID }),
                `${topic.key} question ${i + 1}`,
              ),
            );
          }
          const objective = objectiveQuestions(chapter);
          expect(objective.length, `${chapter.key} quiz size`).toBeGreaterThanOrEqual(5);
          valid(
            AssessmentInput,
            quizBody(course, chapter, { courseId: ID, subjectId: ID, chapterId: ID }),
            `quiz ${chapter.key}`,
          );
          valid(
            AssessmentStructureInput,
            quizStructure(
              objective.map((_, i) => `00000000-0000-7000-8000-${String(i + 1).padStart(12, '0')}`),
            ),
            `quiz structure ${chapter.key}`,
          );
        }
        // Enough objective questions in the bank for a full subject test.
        const pool = course.chapters.flatMap(objectiveQuestions).length;
        expect(pool).toBeGreaterThanOrEqual(testRules.subjectTest.questionCount);
        valid(AssessmentInput, subjectTestBody(course, { courseId: ID, subjectId: ID }), 'subject test');
        valid(AssessmentStructureInput, subjectTestStructure(ID), 'subject test structure');
      });

      it('has substantial notes, and handouts that render without losing characters', async () => {
        for (const chapter of course.chapters) {
          for (const topic of chapter.topics) {
            const words = plainText(md(topic.note)).split(/\s+/).filter(Boolean).length;
            expect(words, `${topic.key} note length`).toBeGreaterThanOrEqual(150);
          }
          const handout = handoutFor(course, chapter);
          const text = [
            handout.courseTitle,
            handout.chapterTitle,
            ...handout.sections.flatMap((s) => [s.title, plainText(s.doc)]),
          ].join('\n');
          expect(unsupportedChars(text), `${chapter.key} characters the PDF fonts cannot show`).toEqual([]);
          const bytes = await renderHandout(handout);
          expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
          expect(bytes.length).toBeGreaterThan(5_000);
        }
      });
    });
  }
});
