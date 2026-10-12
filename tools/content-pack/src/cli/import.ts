/* eslint-disable no-console -- command-line tool: console output is its interface */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdminApi } from '../api.ts';
import { articles, categories, categoryTypes, coupons, notices, plans } from '../content/catalog.ts';
import { courses, handoutFile, handoutFor } from '../pack.ts';
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
  isObjective,
  keyPointsTitle,
  noteBody,
  noticeBody,
  pdfBody,
  planBody,
  planPricingBody,
  PUBLISHED,
  questionBody,
  quizBody,
  quizStructure,
  revisionTopic,
  subjectBody,
  subjectTestBody,
  subjectTestStructure,
  topicBody,
} from '../payloads.ts';
import { renderHandout } from '../pdf.ts';

/**
 * Loads the university content pack into a running API through the Admin API, as a staff member would (D-071).
 *
 *   CONTENT_API_URL=http://localhost:4000/api/v1 CONTENT_ADMIN_EMAIL=… CONTENT_ADMIN_PASSWORD=… \
 *     pnpm --filter @tk/content-pack import
 *
 * The account needs Super Admin (or content, course, question, assessment, commerce, notice and article rights).
 * With two-factor sign-in, set CONTENT_ADMIN_MFA_CODE or type the code when asked. Safe to run again: what was
 * created is remembered in tools/content-pack/.state/ and skipped; categories, plans, coupons and articles that
 * already exist (same key, slug or code) are reused. Everything is published.
 */
const base = process.env['CONTENT_API_URL'] ?? 'http://localhost:4000/api/v1';
const email = process.env['CONTENT_ADMIN_EMAIL'];
const password = process.env['CONTENT_ADMIN_PASSWORD'];
if (!email || !password) {
  console.error(
    'Set CONTENT_ADMIN_EMAIL and CONTENT_ADMIN_PASSWORD (a staff account of the API you import into).',
  );
  process.exit(1);
}
const api = new AdminApi(base, { email, password, mfaCode: process.env['CONTENT_ADMIN_MFA_CODE'] });

// ── Remembered ids, per API ──
const stateDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.state');
const stateFile = path.join(stateDir, `${new URL(base).host.replace(/[^a-z0-9.-]/gi, '_')}.json`);
let ids: Record<string, string> = {};
try {
  ids = JSON.parse(await readFile(stateFile, 'utf8')) as Record<string, string>;
} catch {
  ids = {};
}
async function remember(key: string, id: string) {
  ids[key] = id;
  await mkdir(stateDir, { recursive: true });
  await writeFile(stateFile, JSON.stringify(ids, null, 2));
}

const counts: Record<string, number> = {};
const count = (what: string) => (counts[what] = (counts[what] ?? 0) + 1);

/** Creates (and publishes) something once: the id is remembered under `key`. */
async function once(
  key: string,
  what: string,
  create: () => Promise<{ id: string }>,
  publish?: (id: string) => Promise<unknown>,
): Promise<string> {
  const known = ids[key];
  if (known) return known;
  const { id } = await create();
  if (publish) await publish(id);
  await remember(key, id);
  count(what);
  return id;
}

const list = <T>(result: unknown): T[] =>
  Array.isArray(result) ? (result as T[]) : (((result as { data?: T[] } | null)?.data ?? []) as T[]);

async function main() {
  await api.login();
  console.log(`Signed in to ${base} as ${email}.`);

  // ── Category types and categories ──
  const types = list<{ key: string }>(await api.call('GET', '/admin/exam-node-types'));
  for (const t of categoryTypes) {
    if (!types.some((x) => x.key === t.key)) {
      await api.call('POST', '/admin/exam-node-types', examNodeTypeBody(t));
      count('category types');
    }
  }
  const existingNodes = list<{ id: string; slug: string }>(await api.call('GET', '/admin/exam-nodes'));
  for (const c of categories) {
    const existing = existingNodes.find((n) => n.slug === c.slug);
    if (existing && !ids[`node:${c.key}`]) await remember(`node:${c.key}`, existing.id);
    await once(
      `node:${c.key}`,
      'categories',
      () =>
        api.call('POST', '/admin/exam-nodes', examNodeBody(c, c.parent ? ids[`node:${c.parent}`]! : null)),
      (id) => api.call('PUT', `/admin/exam-nodes/${id}/status`, PUBLISHED),
    );
  }

  // ── Courses ──
  const existingCourses = list<{ id: string; slug: string }>(
    await api.call('GET', '/admin/courses?limit=100'),
  );
  for (const course of courses) {
    if (!ids[`course:${course.key}`] && existingCourses.some((c) => c.slug === course.slug)) {
      console.warn(`! A course "${course.slug}" already exists here (not made by this importer): skipped.`);
      continue;
    }
    console.log(`Course: ${course.title.en}`);
    const subjectId = await once(
      `subject:${course.key}`,
      'subjects',
      () => api.call('POST', '/admin/subjects', subjectBody(course)),
      (id) => api.call('PUT', `/admin/subjects/${id}/status`, PUBLISHED),
    );
    const questionIdsByChapter: Record<string, string[]> = {};
    for (const chapter of course.chapters) {
      const access = chapterAccess(course, chapter);
      const chapterId = await once(
        `chapter:${chapter.key}`,
        'chapters',
        () => api.call('POST', `/admin/subjects/${subjectId}/chapters`, chapterBody(chapter)),
        (id) => api.call('PUT', `/admin/chapters/${id}/status`, PUBLISHED),
      );
      questionIdsByChapter[chapter.key] = [];
      for (const [i, topic] of chapter.topics.entries()) {
        const topicId = await once(
          `topic:${topic.key}`,
          'topics',
          () =>
            api.call(
              'POST',
              `/admin/chapters/${chapterId}/topics`,
              topicBody(topic, `${chapter.numberLabel}.${i + 1}`),
            ),
          (id) => api.call('PUT', `/admin/topics/${id}/status`, PUBLISHED),
        );
        await once(
          `note:${topic.key}`,
          'notes',
          () => api.call('POST', `/admin/topics/${topicId}/items`, noteBody(topic.title, topic.note, access)),
          (id) => api.call('PUT', `/admin/learning-items/${id}/publishing`, PUBLISHED),
        );
        for (const [n, q] of topic.questions.entries()) {
          const questionId = await once(
            `question:${topic.key}:${n + 1}`,
            'questions',
            () =>
              api.call('POST', '/admin/questions', questionBody(course, chapter, q, { subjectId, topicId })),
            (id) => api.call('PUT', `/admin/questions/${id}/status`, PUBLISHED),
          );
          if (isObjective(q)) questionIdsByChapter[chapter.key]!.push(questionId);
        }
      }
      // Revision topic: key points and the chapter handout (our own PDF, D-071).
      const revision = revisionTopic(chapter);
      const revisionId = await once(
        `revision:${chapter.key}`,
        'topics',
        () =>
          api.call('POST', `/admin/chapters/${chapterId}/topics`, topicBody(revision, revision.numberLabel)),
        (id) => api.call('PUT', `/admin/topics/${id}/status`, PUBLISHED),
      );
      await once(
        `keypoints:${chapter.key}`,
        'notes',
        () =>
          api.call(
            'POST',
            `/admin/topics/${revisionId}/items`,
            noteBody(keyPointsTitle(chapter), chapter.revision, access),
          ),
        (id) => api.call('PUT', `/admin/learning-items/${id}/publishing`, PUBLISHED),
      );
      const mediaId = await once(`media:${chapter.key}`, 'PDF uploads', async () => {
        const bytes = await renderHandout(handoutFor(course, chapter));
        return api.upload<{ id: string }>(
          { visibility: 'private' },
          handoutFile(course, chapter),
          bytes,
          'application/pdf',
        );
      });
      await once(
        `pdf:${chapter.key}`,
        'PDF lessons',
        () => api.call('POST', `/admin/topics/${revisionId}/items`, pdfBody(chapter, mediaId, access)),
        (id) => api.call('PUT', `/admin/learning-items/${id}/publishing`, PUBLISHED),
      );
    }

    // The course itself: details, price, subject, semester, then published.
    const courseId = await once(`course:${course.key}`, 'courses', async () => {
      const created = await api.call<{ id: string }>('POST', '/admin/courses', courseBody(course));
      await api.call('PUT', `/admin/courses/${created.id}/pricing`, coursePricingBody());
      await api.call('PUT', `/admin/courses/${created.id}/subjects`, courseSubjectsBody(subjectId));
      await api.call(
        'PUT',
        `/admin/courses/${created.id}/links`,
        courseLinksBody([ids[`node:${course.semester}`]!]),
      );
      await api.call('PUT', `/admin/courses/${created.id}/publishing`, PUBLISHED);
      return created;
    });

    // Chapter quizzes and the subject test.
    for (const chapter of course.chapters) {
      const chapterId = ids[`chapter:${chapter.key}`]!;
      await once(`quiz:${chapter.key}`, 'quizzes', async () => {
        const created = await api.call<{ id: string }>(
          'POST',
          '/admin/assessments',
          quizBody(course, chapter, { courseId, subjectId, chapterId }),
        );
        await api.call(
          'PUT',
          `/admin/assessments/${created.id}/structure`,
          quizStructure(questionIdsByChapter[chapter.key]!),
        );
        await api.call('PUT', `/admin/assessments/${created.id}/publishing`, PUBLISHED);
        return created;
      });
    }
    await once(`test:${course.key}`, 'subject tests', async () => {
      const created = await api.call<{ id: string }>(
        'POST',
        '/admin/assessments',
        subjectTestBody(course, { courseId, subjectId }),
      );
      await api.call('PUT', `/admin/assessments/${created.id}/structure`, subjectTestStructure(subjectId));
      await api.call('PUT', `/admin/assessments/${created.id}/publishing`, PUBLISHED);
      return created;
    });
  }

  // ── Plans ──
  const existingPlans = list<{ id: string; slug: string }>(await api.call('GET', '/admin/plans'));
  for (const plan of plans) {
    const existing = existingPlans.find((p) => p.slug === plan.slug);
    if (existing && !ids[`plan:${plan.slug}`]) await remember(`plan:${plan.slug}`, existing.id);
    await once(`plan:${plan.slug}`, 'plans', async () => {
      const created = await api.call<{ id: string }>('POST', '/admin/plans', planBody(plan));
      await api.call('PUT', `/admin/plans/${created.id}/pricing`, planPricingBody(plan));
      if (plan.coverage === 'selected') {
        await api.call('PUT', `/admin/plans/${created.id}/courses`, {
          courseIds: plan.courses.map((key) => ids[`course:${key}`]).filter(Boolean),
        });
      }
      await api.call('PUT', `/admin/plans/${created.id}/status`, PUBLISHED);
      return created;
    });
  }

  // ── Coupons ──
  for (const coupon of coupons) {
    const found = list<{ id: string; code: string }>(
      await api.call('GET', `/admin/coupons?q=${coupon.code}`),
    ).find((c) => c.code === coupon.code);
    if (found && !ids[`coupon:${coupon.code}`]) await remember(`coupon:${coupon.code}`, found.id);
    await once(`coupon:${coupon.code}`, 'coupons', () => api.call('POST', '/admin/coupons', coupon));
  }

  // ── Notices and articles ──
  for (const notice of notices) {
    await once(
      `notice:${notice.key}`,
      'notices',
      () => api.call('POST', '/admin/notices', noticeBody(notice)),
      (id) => api.call('PUT', `/admin/notices/${id}/status`, PUBLISHED),
    );
  }
  for (const article of articles) {
    const found = list<{ id: string; slug: string }>(
      await api.call('GET', `/admin/articles?q=${encodeURIComponent(article.title.en)}`),
    ).find((a) => a.slug === article.slug);
    if (found && !ids[`article:${article.slug}`]) await remember(`article:${article.slug}`, found.id);
    await once(
      `article:${article.slug}`,
      'articles',
      () => api.call('POST', '/admin/articles', articleBody(article)),
      (id) => api.call('PUT', `/admin/articles/${id}/status`, PUBLISHED),
    );
  }

  const created = Object.entries(counts)
    .map(([what, n]) => `${n} ${what}`)
    .join(', ');
  console.log(created ? `Done. Created ${created}.` : 'Done. Everything was already there.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  console.error('Stopped. What was created so far is remembered; run the import again to continue.');
  process.exit(1);
});
