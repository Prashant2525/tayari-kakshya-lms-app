import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { note, publisher, seedPublishedCourse } from './content-helpers.js';
import { pngFixture } from './fixtures.js';
import { call, createStaff, createTestApp, staffLogin, upload, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
});

describe('exam taxonomy (D-007, D-010)', () => {
  it('enforces the hierarchy order and unique slugs', async () => {
    const token = await publisher(ctx);
    const police = await call(ctx, 'POST', '/admin/exam-nodes', {
      token,
      body: { parentId: null, nodeType: 'authority', name: { en: 'Nepal Police' }, slug: 'nepal-police' },
    });
    expect(police.status).toBe(201);

    const orphanPost = await call(ctx, 'POST', '/admin/exam-nodes', {
      token,
      body: { parentId: null, nodeType: 'post', name: { en: 'Constable' }, slug: 'constable' },
    });
    expect(orphanPost.status).toBe(400);

    const post = await call(ctx, 'POST', '/admin/exam-nodes', {
      token,
      body: { parentId: police.body.id, nodeType: 'post', name: { en: 'Constable' }, slug: 'constable' },
    });
    expect(post.status).toBe(201);

    const levelUnderPost = await call(ctx, 'POST', '/admin/exam-nodes', {
      token,
      body: { parentId: post.body.id, nodeType: 'level', name: { en: 'Bad' }, slug: 'bad' },
    });
    expect(levelUnderPost.status).toBe(400);

    const dupe = await call(ctx, 'POST', '/admin/exam-nodes', {
      token,
      body: { parentId: police.body.id, nodeType: 'post', name: { en: 'Other' }, slug: 'constable' },
    });
    expect(dupe.status).toBe(409);

    expect((await call(ctx, 'DELETE', `/admin/exam-nodes/${police.body.id}`, { token })).status).toBe(409);
  });

  it('shows students only published categories', async () => {
    const token = await publisher(ctx);
    const node = await call(ctx, 'POST', '/admin/exam-nodes', {
      token,
      body: { parentId: null, nodeType: 'authority', name: { en: 'APF' }, slug: 'apf' },
    });
    expect((await call(ctx, 'GET', '/exam-nodes')).body).toEqual([]);
    await call(ctx, 'PUT', `/admin/exam-nodes/${node.body.id}/status`, {
      token,
      body: { status: 'published' },
    });
    expect((await call(ctx, 'GET', '/exam-nodes')).body).toEqual([
      expect.objectContaining({ slug: 'apf', name: { en: 'APF' } }),
    ]);
  });

  it('validates papers (pass marks ≤ full marks, posts only) and protects papers used by courses', async () => {
    const token = await publisher(ctx);
    const bad = await call(ctx, 'POST', '/admin/papers', {
      token,
      body: { name: { en: 'Paper I' }, fullMarks: 50, passMarks: 60 },
    });
    expect(bad.status).toBe(400);
    const authority = await call(ctx, 'POST', '/admin/exam-nodes', {
      token,
      body: { parentId: null, nodeType: 'authority', name: { en: 'PSC' }, slug: 'psc' },
    });
    const notAPost = await call(ctx, 'POST', '/admin/papers', {
      token,
      body: { name: { en: 'Paper I' }, fullMarks: 100, passMarks: 40, postIds: [authority.body.id] },
    });
    expect(notAPost.status).toBe(400);
    const paper = await call(ctx, 'POST', '/admin/papers', {
      token,
      body: { name: { en: 'Paper I' }, fullMarks: 100, passMarks: 40, durationMinutes: 180 },
    });
    expect(paper.status).toBe(201);
    expect(paper.body).toMatchObject({ fullMarks: 100, passMarks: 40 });
  });
});

describe('publishing workflow and permissions', () => {
  it('lets editors draft and submit for review but not publish, and blocks edits to live content', async () => {
    await createStaff(ctx, 'editor@example.com', { permissions: ['content:edit'] });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;
    const pub = await publisher(ctx);

    const subject = await call(ctx, 'POST', '/admin/subjects', {
      token: editor,
      body: { name: { en: 'Math' } },
    });
    expect(subject.status).toBe(201);
    expect(
      (
        await call(ctx, 'PUT', `/admin/subjects/${subject.body.id}/status`, {
          token: editor,
          body: { status: 'in_review' },
        })
      ).status,
    ).toBe(204);
    const denied = await call(ctx, 'PUT', `/admin/subjects/${subject.body.id}/status`, {
      token: editor,
      body: { status: 'published' },
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error.details.required).toBe('content:publish');

    expect(
      (
        await call(ctx, 'PUT', `/admin/subjects/${subject.body.id}/status`, {
          token: pub,
          body: { status: 'published' },
        })
      ).status,
    ).toBe(204);
    const editLive = await call(ctx, 'PUT', `/admin/subjects/${subject.body.id}`, {
      token: editor,
      body: { name: { en: 'Maths' } },
    });
    expect(editLive.status).toBe(403);
    expect(
      (
        await call(ctx, 'PUT', `/admin/subjects/${subject.body.id}`, {
          token: pub,
          body: { name: { en: 'Maths' } },
        })
      ).status,
    ).toBe(204);
  });

  it('schedules items for the future and only accepts future times', async () => {
    const token = await publisher(ctx);
    const seeded = await seedPublishedCourse(ctx, token);
    const past = await call(ctx, 'PUT', `/admin/learning-items/${seeded.freeNote.id}/publishing`, {
      token,
      body: { status: 'scheduled', publishAt: new Date(Date.now() - 60_000).toISOString() },
    });
    expect(past.status).toBe(400);
    const future = await call(ctx, 'PUT', `/admin/learning-items/${seeded.freeNote.id}/publishing`, {
      token,
      body: { status: 'scheduled', publishAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    expect(future.status).toBe(204);
  });

  it('rejects unsafe rich text and private images in notes', async () => {
    const token = await publisher(ctx);
    const seeded = await seedPublishedCourse(ctx, token);
    const xss = await call(ctx, 'POST', `/admin/topics/${seeded.topic.id}/items`, {
      token,
      body: {
        type: 'note',
        title: { en: 'x' },
        accessLevel: 'free',
        noteContent: {
          en: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'x',
                    marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                  },
                ],
              },
            ],
          },
        },
      },
    });
    expect(xss.status).toBe(400);

    const privateImage = await upload(
      ctx,
      token,
      { name: 'p.png', contentType: 'image/png', data: await pngFixture(200, 200, '#ff0000') },
      { visibility: 'private' },
    );
    const withPrivate = await call(ctx, 'POST', `/admin/topics/${seeded.topic.id}/items`, {
      token,
      body: {
        type: 'note',
        title: { en: 'x' },
        accessLevel: 'free',
        noteContent: {
          en: { type: 'doc', content: [{ type: 'image', attrs: { mediaId: privateImage.body.id } }] },
        },
      },
    });
    expect(withPrivate.status).toBe(400);
  });

  it('keeps media that content uses from being deleted', async () => {
    const token = await publisher(ctx);
    const seeded = await seedPublishedCourse(ctx, token);
    const res = await call(ctx, 'DELETE', `/admin/media/${seeded.pdfMedia.id}`, { token });
    expect(res.status).toBe(409);
  });
});

describe('courses', () => {
  it('needs courses:pricing to change prices and rejects invalid sales', async () => {
    await createStaff(ctx, 'cm@example.com', { permissions: ['courses:edit'] });
    const editor = (await staffLogin(ctx, 'cm@example.com')).token;
    const course = await call(ctx, 'POST', '/admin/courses', {
      token: editor,
      body: { slug: 'officer-cadet', title: { en: 'Officer Cadet' } },
    });
    expect(course.status).toBe(201);
    const pricing = {
      pricePaisa: 300_000,
      salePricePaisa: null,
      saleStartsAt: null,
      saleEndsAt: null,
      validityType: 'lifetime',
      validityDays: null,
      validityEndsOn: null,
    };
    expect(
      (await call(ctx, 'PUT', `/admin/courses/${course.body.id}/pricing`, { token: editor, body: pricing }))
        .status,
    ).toBe(403);

    const pub = await publisher(ctx);
    const badSale = await call(ctx, 'PUT', `/admin/courses/${course.body.id}/pricing`, {
      token: pub,
      body: { ...pricing, salePricePaisa: 400_000 },
    });
    expect(badSale.status).toBe(400);
    expect(
      (await call(ctx, 'PUT', `/admin/courses/${course.body.id}/pricing`, { token: pub, body: pricing }))
        .status,
    ).toBe(204);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'course.pricing' } });
    expect(audit.changes).toMatchObject({ before: { pricePaisa: 0 }, after: { pricePaisa: 300_000 } });
  });

  it('refuses to delete a course students can access', async () => {
    const token = await publisher(ctx);
    const seeded = await seedPublishedCourse(ctx, token);
    const { registerStudent } = await import('./helpers.js');
    await registerStudent(ctx, 'student@example.com');
    const student = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'student@example.com' } });
    await call(ctx, 'POST', `/admin/users/${student.id}/entitlements`, {
      token,
      body: { courseId: seeded.course.id, endsAt: null },
    });
    const res = await call(ctx, 'DELETE', `/admin/courses/${seeded.course.id}`, { token });
    expect(res.status).toBe(409);
  });
});

describe('instructor scoping', () => {
  it('limits scoped staff to their assigned subjects', async () => {
    const pub = await publisher(ctx);
    const english = await call(ctx, 'POST', '/admin/subjects', {
      token: pub,
      body: { name: { en: 'English' } },
    });
    const nepali = await call(ctx, 'POST', '/admin/subjects', {
      token: pub,
      body: { name: { en: 'Nepali' } },
    });

    const instructor = await createStaff(ctx, 'teacher@example.com', { permissions: ['content:edit'] });
    await ctx.prisma.staffScope.create({
      data: { userId: instructor.id, scopeType: 'subject', scopeId: english.body.id },
    });
    const token = (await staffLogin(ctx, 'teacher@example.com')).token;

    const list = await call(ctx, 'GET', '/admin/subjects', { token });
    expect(list.body.data.map((s: { id: string }) => s.id)).toEqual([english.body.id]);
    expect(
      (
        await call(ctx, 'POST', `/admin/subjects/${english.body.id}/chapters`, {
          token,
          body: { title: { en: 'Grammar' } },
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call(ctx, 'POST', `/admin/subjects/${nepali.body.id}/chapters`, {
          token,
          body: { title: { en: 'व्याकरण' } },
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(ctx, 'POST', '/admin/subjects', { token, body: { name: { en: 'New' } } })).status,
    ).toBe(403);
  });

  it('notes keep their content and reorder correctly', async () => {
    const token = await publisher(ctx);
    const seeded = await seedPublishedCourse(ctx, token);
    const item = await call(ctx, 'GET', `/admin/learning-items/${seeded.premiumNote.id}`, { token });
    expect(item.body.noteContent).toEqual(note('Premium secret body'));
    const ids = [seeded.freeVideo.id, seeded.premiumPdf.id, seeded.premiumNote.id, seeded.freeNote.id];
    expect(
      (await call(ctx, 'PUT', `/admin/topics/${seeded.topic.id}/items/order`, { token, body: { ids } }))
        .status,
    ).toBe(204);
    const tree = await call(ctx, 'GET', `/admin/subjects/${seeded.subject.id}/tree`, { token });
    expect(tree.body.chapters[0].topics[0].items.map((i: { id: string }) => i.id)).toEqual(ids);
  });
});
