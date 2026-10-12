import {
  categoryTypes,
  coursePricing,
  testRules,
  type PackArticle,
  type PackCategory,
  type PackNotice,
  type PackPlan,
} from './content/catalog.ts';
import { md } from './markdown.ts';
import { OBJECTIVE_TYPES } from './questions.ts';
import type { Names, PackChapter, PackCourse, PackQuestion, PackTopic } from './types.ts';

/**
 * The Admin API request bodies for a content pack, as pure functions of the pack and the ids already created.
 * The importer sends them; the tests check every one against the API's own schemas (@tk/contracts).
 */
type Access = 'free' | 'premium';

/** D-071: each course's first chapter (its notes, PDF, practice questions and quiz) is free; the rest is premium. */
export const chapterAccess = (course: PackCourse, chapter: PackChapter): Access =>
  course.chapters[0] === chapter ? 'free' : 'premium';

const round2 = (n: number) => Math.round(n * 100) / 100;
export const isObjective = (q: PackQuestion) =>
  (OBJECTIVE_TYPES as readonly string[]).includes(q.content.type);
export const objectiveQuestions = (chapter: PackChapter) =>
  chapter.topics.flatMap((t) => t.questions.filter(isObjective));

export const examNodeTypeBody = (t: (typeof categoryTypes)[number]) => ({
  key: t.key,
  name: t.name,
  description: null,
  rank: t.rank,
  topLevel: t.topLevel,
  canHavePapers: false,
  active: true,
});

export const examNodeBody = (c: PackCategory, parentId: string | null) => ({
  parentId,
  nodeType: c.type,
  name: c.name,
  slug: c.slug,
  description: c.description,
});

export const subjectBody = (course: PackCourse) => ({
  name: course.subject.name,
  summary: course.subject.summary,
});

export const chapterBody = (chapter: PackChapter) => ({
  numberLabel: chapter.numberLabel,
  title: chapter.title,
  description: { en: chapter.description },
  estimatedMinutes: chapter.topics.reduce((n, t) => n + t.estimatedMinutes, 0) + 10,
});

export const topicBody = (topic: Pick<PackTopic, 'title' | 'estimatedMinutes'>, numberLabel: string) => ({
  numberLabel,
  title: topic.title,
  description: null,
  estimatedMinutes: topic.estimatedMinutes,
});

/** Each chapter ends with a revision topic: the key points and the chapter's PDF handout. */
export const revisionTopic = (chapter: PackChapter) => ({
  title: {
    en: `Revision and handout`,
    ne: `पुनरावलोकन र ह्यान्डआउट`,
  },
  estimatedMinutes: 10,
  numberLabel: `${chapter.numberLabel}.${chapter.topics.length + 1}`,
});

export const noteBody = (title: Names, markdown: string, accessLevel: Access) => ({
  type: 'note' as const,
  title,
  accessLevel,
  language: 'en' as const,
  noteContent: { en: md(markdown) },
});

export const keyPointsTitle = (chapter: PackChapter): Names => ({
  en: `Key points: Chapter ${chapter.numberLabel}`,
  ne: `मुख्य बुँदा: अध्याय ${chapter.numberLabel}`,
});

export const pdfBody = (chapter: PackChapter, pdfMediaId: string, accessLevel: Access) => ({
  type: 'pdf' as const,
  title: {
    en: `Chapter ${chapter.numberLabel} handout (PDF)`,
    ne: `अध्याय ${chapter.numberLabel} ह्यान्डआउट (PDF)`,
  },
  accessLevel,
  language: 'en' as const,
  pdfMediaId,
  downloadable: false,
});

export const questionBody = (
  course: PackCourse,
  chapter: PackChapter,
  q: PackQuestion,
  ids: { subjectId: string; topicId: string },
) => ({
  subjectId: ids.subjectId,
  topicId: ids.topicId,
  difficulty: q.difficulty,
  defaultMarks: testRules.marksPerQuestion,
  defaultNegativeMarks: 0,
  language: 'en' as const,
  accessLevel: chapterAccess(course, chapter),
  tags: [course.slug, ...(q.tags ?? [])],
  sources: [],
  content: q.content,
});

export const courseBody = (course: PackCourse) => ({
  slug: course.slug,
  title: course.title,
  shortDescription: course.shortDescription,
  description: { en: md(course.description) },
  thumbnailMediaId: null,
  language: 'en' as const,
  isFeatured: course.isFeatured,
  popularityRank: course.popularityRank,
});

export const coursePricingBody = () => ({ ...coursePricing });

export const courseSubjectsBody = (subjectId: string) => ({ subjects: [{ subjectId }] });

export const courseLinksBody = (examNodeIds: string[]) => ({ examNodeIds, instructorIds: [] });

const SCORING = {
  negativeMarking: false,
  multipleChoice: 'all_or_nothing' as const,
  match: 'per_pair' as const,
  fillBlank: 'per_blank' as const,
  scoreFloor: 'zero' as const,
};

/** A chapter quiz: the chapter's objective questions, untimed, unlimited attempts (D-071). */
export const quizBody = (
  course: PackCourse,
  chapter: PackChapter,
  ids: { courseId: string; subjectId: string; chapterId: string },
) => {
  const count = objectiveQuestions(chapter).length;
  const pass = round2(count * testRules.passFraction);
  return {
    type: 'quiz' as const,
    title: {
      en: `Chapter ${chapter.numberLabel} quiz: ${chapter.title.en}`,
      ne: `अध्याय ${chapter.numberLabel} क्विज: ${chapter.title.ne}`,
    },
    instructions: {
      en: md(
        `**${count} questions** · 1 mark each · no negative marking · pass mark **${pass}** (40%).\n\nNo time limit — take it as many times as you like. Each answer is explained after you submit.`,
      ),
    },
    courseId: ids.courseId,
    subjectId: ids.subjectId,
    chapterId: ids.chapterId,
    topicId: null,
    examNodeId: null,
    accessLevel: chapterAccess(course, chapter),
    availability: 'always' as const,
    opensAt: null,
    closesAt: null,
    durationMinutes: null,
    maxAttempts: null,
    passMarks: pass,
    scoring: SCORING,
    shuffleQuestions: false,
    shuffleOptions: true,
    resultRelease: 'immediate' as const,
    showExplanations: true,
    leaderboardEnabled: false,
    subjectiveGrading: 'none' as const,
    countedAttempt: 'best' as const,
  };
};

export const quizStructure = (questionIds: string[]) => ({
  sections: [
    { title: null, pickMode: 'fixed' as const, questions: questionIds.map((questionId) => ({ questionId })) },
  ],
});

/** The course's subject test: 20 random objective questions in 30 minutes; best attempt counts (D-071). */
export const subjectTestBody = (course: PackCourse, ids: { courseId: string; subjectId: string }) => {
  const { questionCount, durationMinutes } = testRules.subjectTest;
  const pass = round2(questionCount * testRules.marksPerQuestion * testRules.passFraction);
  return {
    type: 'subject_test' as const,
    title: { en: `${course.title.en}: subject test`, ne: `${course.title.ne}: विषय परीक्षा` },
    instructions: {
      en: md(
        `**${questionCount} questions** picked at random from the whole course · **${durationMinutes} minutes** · 1 mark each · no negative marking · pass mark **${pass}** (40%).\n\nYou can take it again; your **best attempt** counts on the leaderboard.`,
      ),
    },
    courseId: ids.courseId,
    subjectId: ids.subjectId,
    chapterId: null,
    topicId: null,
    examNodeId: null,
    accessLevel: 'premium' as const,
    availability: 'always' as const,
    opensAt: null,
    closesAt: null,
    durationMinutes,
    maxAttempts: null,
    passMarks: pass,
    scoring: SCORING,
    shuffleQuestions: true,
    shuffleOptions: true,
    resultRelease: 'immediate' as const,
    showExplanations: true,
    leaderboardEnabled: true,
    subjectiveGrading: 'none' as const,
    countedAttempt: 'best' as const,
  };
};

export const subjectTestStructure = (subjectId: string) => ({
  sections: [
    {
      title: null,
      pickMode: 'random' as const,
      questions: [],
      filter: { subjectId, types: [...OBJECTIVE_TYPES] },
      questionCount: testRules.subjectTest.questionCount,
      marksPerQuestion: testRules.marksPerQuestion,
      negativeMarksPerQuestion: 0,
    },
  ],
});

export const planBody = (plan: PackPlan) => ({
  slug: plan.slug,
  name: plan.name,
  description: plan.description,
  features: plan.features,
  coverage: plan.coverage,
  isFeatured: plan.isFeatured,
  sortOrder: plan.sortOrder,
});

export const planPricingBody = (plan: PackPlan) => ({
  ...coursePricing,
  pricePaisa: plan.pricePaisa,
  salePricePaisa: null,
});

export const noticeBody = (notice: PackNotice) => ({
  kind: notice.kind,
  title: notice.title,
  body: { en: md(notice.body) },
  isPinned: notice.isPinned,
  expiresAt: null,
  notify: false,
});

export const articleBody = (article: PackArticle) => ({
  kind: 'blog' as const,
  slug: article.slug,
  title: article.title,
  summary: article.summary,
  body: { en: md(article.body) },
  coverMediaId: null,
  categoryId: null,
  period: null,
  periodDate: null,
  sourceName: null,
  sourceUrl: null,
  quizAssessmentId: null,
  isFeatured: article.isFeatured,
  notify: false,
});

export const PUBLISHED = { status: 'published' as const };
