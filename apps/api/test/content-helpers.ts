import { pdfFixture } from './fixtures.js';
import { call, createStaff, staffLogin, upload, type TestContext } from './helpers.js';

export const ALL_CONTENT_PERMISSIONS = [
  'taxonomy:manage',
  'content:edit',
  'content:publish',
  'courses:edit',
  'courses:publish',
  'courses:pricing',
  'media:manage',
  'entitlements:grant',
  'users:read',
  'instructors:manage',
  'questions:edit',
  'questions:publish',
  'question_reports:manage',
];

export const note = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

/** A publisher with every content permission (not a Super Admin, so scoping/permission rules apply normally). */
export async function publisher(ctx: TestContext, email = 'publisher@example.com') {
  await createStaff(ctx, email, { permissions: ALL_CONTENT_PERMISSIONS });
  return (await staffLogin(ctx, email)).token;
}

async function ok<T>(promise: Promise<{ status: number; body: T }>, expected = [200, 201, 204]): Promise<T> {
  const res = await promise;
  if (!expected.includes(res.status))
    throw new Error(`Unexpected ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

/**
 * Builds a published course: authority → post, subject → chapter → topic with one free note, one premium note,
 * one premium PDF and one free YouTube video.
 */
export async function seedPublishedCourse(ctx: TestContext, token: string, slug = 'sainey-likhit') {
  const authority = await ok(
    call(ctx, 'POST', '/admin/exam-nodes', {
      token,
      body: {
        parentId: null,
        nodeType: 'authority',
        name: { en: 'Nepal Police', ne: 'नेपाल प्रहरी' },
        slug: `police-${slug}`,
      },
    }),
  );
  const post = await ok(
    call(ctx, 'POST', '/admin/exam-nodes', {
      token,
      body: {
        parentId: authority.id,
        nodeType: 'post',
        name: { en: 'Constable' },
        slug: `constable-${slug}`,
      },
    }),
  );
  for (const id of [authority.id, post.id]) {
    await ok(call(ctx, 'PUT', `/admin/exam-nodes/${id}/status`, { token, body: { status: 'published' } }));
  }

  const subject = await ok(
    call(ctx, 'POST', '/admin/subjects', { token, body: { name: { en: 'English', ne: 'अंग्रेजी' } } }),
  );
  const chapter = await ok(
    call(ctx, 'POST', `/admin/subjects/${subject.id}/chapters`, {
      token,
      body: { numberLabel: '1', title: { en: 'Grammar' } },
    }),
  );
  const topic = await ok(
    call(ctx, 'POST', `/admin/chapters/${chapter.id}/topics`, {
      token,
      body: { numberLabel: '1.1', title: { en: 'Articles' } },
    }),
  );
  for (const [level, id] of [
    ['subjects', subject.id],
    ['chapters', chapter.id],
    ['topics', topic.id],
  ] as const) {
    await ok(call(ctx, 'PUT', `/admin/${level}/${id}/status`, { token, body: { status: 'published' } }));
  }

  const pdfMedia = (
    await upload(
      ctx,
      token,
      { name: 'grammar.pdf', contentType: 'application/pdf', data: await pdfFixture(4) },
      { visibility: 'private' },
    )
  ).body;
  const freeNote = await ok(
    call(ctx, 'POST', `/admin/topics/${topic.id}/items`, {
      token,
      body: { type: 'note', title: { en: 'Intro' }, accessLevel: 'free', noteContent: note('Free intro') },
    }),
  );
  const premiumNote = await ok(
    call(ctx, 'POST', `/admin/topics/${topic.id}/items`, {
      token,
      body: {
        type: 'note',
        title: { en: 'Deep dive' },
        accessLevel: 'premium',
        noteContent: note('Premium secret body'),
      },
    }),
  );
  const premiumPdf = await ok(
    call(ctx, 'POST', `/admin/topics/${topic.id}/items`, {
      token,
      body: {
        type: 'pdf',
        title: { en: 'Grammar PDF' },
        accessLevel: 'premium',
        pdfMediaId: pdfMedia.id,
        downloadable: false,
      },
    }),
  );
  const freeVideo = await ok(
    call(ctx, 'POST', `/admin/topics/${topic.id}/items`, {
      token,
      body: {
        type: 'video',
        title: { en: 'Video lesson' },
        accessLevel: 'free',
        video: { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' },
        durationSeconds: 212,
      },
    }),
  );
  for (const item of [freeNote, premiumNote, premiumPdf, freeVideo]) {
    await ok(
      call(ctx, 'PUT', `/admin/learning-items/${item.id}/publishing`, {
        token,
        body: { status: 'published' },
      }),
    );
  }

  const course = await ok(
    call(ctx, 'POST', '/admin/courses', {
      token,
      body: { slug, title: { en: 'Sainey Likhit' }, shortDescription: { en: 'Written exam prep' } },
    }),
  );
  await ok(
    call(ctx, 'PUT', `/admin/courses/${course.id}/pricing`, {
      token,
      body: {
        pricePaisa: 300_000,
        salePricePaisa: null,
        saleStartsAt: null,
        saleEndsAt: null,
        validityType: 'days',
        validityDays: 365,
        validityEndsOn: null,
      },
    }),
  );
  await ok(
    call(ctx, 'PUT', `/admin/courses/${course.id}/subjects`, {
      token,
      body: {
        subjects: [
          { subjectId: subject.id, displayFullMarks: 100, displayPassMarks: 40, displayDurationMinutes: 180 },
        ],
      },
    }),
  );
  await ok(
    call(ctx, 'PUT', `/admin/courses/${course.id}/links`, {
      token,
      body: { examNodeIds: [post.id], instructorIds: [] },
    }),
  );
  await ok(
    call(ctx, 'PUT', `/admin/courses/${course.id}/publishing`, { token, body: { status: 'published' } }),
  );

  return {
    authority,
    post,
    subject,
    chapter,
    topic,
    pdfMedia,
    freeNote,
    premiumNote,
    premiumPdf,
    freeVideo,
    course,
  };
}
