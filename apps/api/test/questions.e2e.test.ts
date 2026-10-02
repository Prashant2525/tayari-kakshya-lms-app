import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { publisher } from './content-helpers.js';
import { pngFixture } from './fixtures.js';
import {
  call,
  createStaff,
  createTestApp,
  registerStudent,
  staffLogin,
  upload,
  type TestContext,
} from './helpers.js';

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

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const loc = (text: string) => ({ en: doc(text) });
const choices = (...ids: string[]) => ids.map((id) => ({ id, content: loc(`Option ${id}`) }));

async function subjectWithTopic(token: string, name = 'General Knowledge') {
  const subject = (await call(ctx, 'POST', '/admin/subjects', { token, body: { name: { en: name } } })).body;
  const chapter = (
    await call(ctx, 'POST', `/admin/subjects/${subject.id}/chapters`, {
      token,
      body: { title: { en: 'Constitution' } },
    })
  ).body;
  const topic = (
    await call(ctx, 'POST', `/admin/chapters/${chapter.id}/topics`, {
      token,
      body: { title: { en: 'Rights' } },
    })
  ).body;
  return { subjectId: subject.id as string, topicId: topic.id as string };
}

function mcq(subjectId: string, extra: Record<string, unknown> = {}) {
  return {
    subjectId,
    difficulty: 'medium',
    defaultMarks: 2,
    defaultNegativeMarks: 0.4,
    accessLevel: 'premium',
    tags: ['Constitution', 'rights'],
    content: {
      type: 'single_choice',
      stem: loc('Which article guarantees the right to equality?'),
      options: choices('a', 'b', 'c', 'd'),
      correctOptionId: 'c',
      explanation: loc('Article 18.'),
    },
    ...extra,
  };
}

describe('question bank administration', () => {
  it('creates every question type and returns the current version', async () => {
    const token = await publisher(ctx);
    const { subjectId, topicId } = await subjectWithTopic(token);
    const contents = [
      { type: 'single_choice', stem: loc('Q1'), options: choices('a', 'b'), correctOptionId: 'a' },
      {
        type: 'multiple_choice',
        stem: loc('Q2'),
        options: choices('a', 'b', 'c'),
        correctOptionIds: ['a', 'b'],
      },
      { type: 'true_false', stem: loc('Q3'), correct: false },
      {
        type: 'fill_blank',
        stem: loc('Capital is [[b1]].'),
        blanks: [{ id: 'b1', accepted: ['Kathmandu'] }],
      },
      {
        type: 'match',
        stem: loc('Q5'),
        left: choices('l1', 'l2'),
        right: choices('r1', 'r2'),
        pairs: { l1: 'r2', l2: 'r1' },
      },
      { type: 'numeric', stem: loc('Q6'), value: 9.8, tolerance: 0.1 },
      { type: 'subjective', stem: loc('Q7'), modelAnswer: loc('Model') },
    ];
    for (const content of contents) {
      const res = await call(ctx, 'POST', '/admin/questions', {
        token,
        body: { subjectId, topicId, difficulty: 'easy', defaultMarks: 1, accessLevel: 'free', content },
      });
      expect(res.status, content.type).toBe(201);
      expect(res.body).toMatchObject({ type: content.type, versionNo: 1, versionCount: 1, status: 'draft' });
      expect(res.body.content.type).toBe(content.type);
    }
    const list = await call(ctx, 'GET', '/admin/questions?limit=50', { token });
    expect(list.body.data).toHaveLength(7);
    // Previews show the question text only (no options), with blanks as ____.
    const previews = list.body.data.map((q: { preview: string }) => q.preview);
    expect(previews).toContain('Capital is ____.');
    expect(previews).toContain('Q1');
  });

  it('rejects invalid answer keys, marks and topics from another subject', async () => {
    const token = await publisher(ctx);
    const { subjectId } = await subjectWithTopic(token);
    const other = await subjectWithTopic(token, 'Maths');
    const bad = mcq(subjectId);
    bad.content = { ...bad.content, correctOptionId: 'z' };
    expect((await call(ctx, 'POST', '/admin/questions', { token, body: bad })).status).toBe(400);
    const negative = await call(ctx, 'POST', '/admin/questions', {
      token,
      body: mcq(subjectId, { defaultMarks: 1, defaultNegativeMarks: 2 }),
    });
    expect(negative.status).toBe(400);
    const wrongTopic = await call(ctx, 'POST', '/admin/questions', {
      token,
      body: mcq(subjectId, { topicId: other.topicId }),
    });
    expect(wrongTopic.status).toBe(400);
    expect(JSON.stringify(wrongTopic.body)).toContain('same subject');
  });

  it('creates a new immutable version only when the content changes', async () => {
    const token = await publisher(ctx);
    const { subjectId } = await subjectWithTopic(token);
    const created = (await call(ctx, 'POST', '/admin/questions', { token, body: mcq(subjectId) })).body;

    // Metadata-only edit: same version.
    const meta = await call(ctx, 'PUT', `/admin/questions/${created.id}`, {
      token,
      body: mcq(subjectId, { difficulty: 'hard' }),
    });
    expect(meta.body).toMatchObject({ difficulty: 'hard', versionNo: 1, versionCount: 1 });

    const changed = mcq(subjectId);
    changed.content = { ...changed.content, correctOptionId: 'd' };
    const v2 = await call(ctx, 'PUT', `/admin/questions/${created.id}`, { token, body: changed });
    expect(v2.body).toMatchObject({ versionNo: 2, versionCount: 2 });
    expect(v2.body.content.correctOptionId).toBe('d');

    const versions = await call(ctx, 'GET', `/admin/questions/${created.id}/versions`, { token });
    expect(
      versions.body.map((v: { versionNo: number; current: boolean }) => [v.versionNo, v.current]),
    ).toEqual([
      [2, true],
      [1, false],
    ]);
    expect(versions.body[1].content.correctOptionId).toBe('c');

    // The database refuses to change or delete a version.
    await expect(
      ctx.prisma.questionVersion.update({ where: { id: versions.body[1].id }, data: { content: {} } }),
    ).rejects.toThrow(/immutable/);
    await expect(ctx.prisma.questionVersion.delete({ where: { id: versions.body[1].id } })).rejects.toThrow(
      /immutable/,
    );

    const typeChange = mcq(subjectId);
    typeChange.content = { type: 'true_false', stem: loc('Q'), correct: true } as never;
    expect(
      (await call(ctx, 'PUT', `/admin/questions/${created.id}`, { token, body: typeChange })).status,
    ).toBe(400);
  });

  it('enforces the review workflow: editors submit, publishers publish, live questions need publishers', async () => {
    const token = await publisher(ctx);
    const { subjectId } = await subjectWithTopic(token);
    const q = (await call(ctx, 'POST', '/admin/questions', { token, body: mcq(subjectId) })).body;
    await createStaff(ctx, 'editor@example.com', { permissions: ['questions:edit'] });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;

    expect(
      (
        await call(ctx, 'PUT', `/admin/questions/${q.id}/status`, {
          token: editor,
          body: { status: 'in_review' },
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await call(ctx, 'PUT', `/admin/questions/${q.id}/status`, {
          token: editor,
          body: { status: 'published' },
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(ctx, 'PUT', `/admin/questions/${q.id}/status`, { token, body: { status: 'scheduled' } }))
        .status,
    ).toBe(400);
    expect(
      (await call(ctx, 'PUT', `/admin/questions/${q.id}/status`, { token, body: { status: 'published' } }))
        .status,
    ).toBe(204);

    expect(
      (await call(ctx, 'PUT', `/admin/questions/${q.id}`, { token: editor, body: mcq(subjectId) })).status,
    ).toBe(403);
    expect((await call(ctx, 'DELETE', `/admin/questions/${q.id}`, { token: editor })).status).toBe(403);
    expect((await call(ctx, 'DELETE', `/admin/questions/${q.id}`, { token })).status).toBe(204);
    expect((await call(ctx, 'GET', '/admin/questions', { token })).body.data).toHaveLength(0);
    expect((await call(ctx, 'POST', `/admin/questions/${q.id}/restore`, { token })).status).toBe(204);
    expect((await call(ctx, 'GET', '/admin/questions', { token })).body.data).toHaveLength(1);

    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityId: q.id } })).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(['question.create', 'question.status', 'question.delete', 'question.restore']),
    );
  });

  it('keeps scoped staff inside their subjects', async () => {
    const token = await publisher(ctx);
    const mine = await subjectWithTopic(token, 'Mine');
    const theirs = await subjectWithTopic(token, 'Theirs');
    await call(ctx, 'POST', '/admin/questions', { token, body: mcq(mine.subjectId) });
    const other = (await call(ctx, 'POST', '/admin/questions', { token, body: mcq(theirs.subjectId) })).body;
    const scoped = await createStaff(ctx, 'scoped@example.com', { permissions: ['questions:edit'] });
    await ctx.prisma.staffScope.create({
      data: { userId: scoped.id, scopeType: 'subject', scopeId: mine.subjectId },
    });
    const t = (await staffLogin(ctx, 'scoped@example.com')).token;

    expect((await call(ctx, 'GET', '/admin/questions', { token: t })).body.data).toHaveLength(1);
    expect(
      (await call(ctx, 'GET', `/admin/questions?subjectId=${theirs.subjectId}`, { token: t })).body.data,
    ).toHaveLength(0);
    expect((await call(ctx, 'GET', `/admin/questions/${other.id}`, { token: t })).status).toBe(403);
    expect(
      (await call(ctx, 'POST', '/admin/questions', { token: t, body: mcq(theirs.subjectId) })).status,
    ).toBe(403);
    expect(
      (await call(ctx, 'POST', '/admin/questions', { token: t, body: mcq(mine.subjectId) })).status,
    ).toBe(201);
  });

  it('filters by text, tag, type and previous-year source', async () => {
    const token = await publisher(ctx);
    const { subjectId } = await subjectWithTopic(token);
    const node = (
      await call(ctx, 'POST', '/admin/exam-nodes', {
        token,
        body: { parentId: null, nodeType: 'authority', name: { en: 'Nepal Police' }, slug: 'nepal-police' },
      })
    ).body;
    await call(ctx, 'POST', '/admin/questions', {
      token,
      body: mcq(subjectId, {
        tags: ['RIGHTS', 'rights', 'PYQ 2079'],
        sources: [{ examNodeId: node.id, yearBs: 2079 }],
      }),
    });
    const tf = mcq(subjectId, { tags: [] });
    tf.content = { type: 'true_false', stem: loc('Nepal is landlocked.'), correct: true } as never;
    await call(ctx, 'POST', '/admin/questions', { token, body: tf });

    const q = (s: string) =>
      call(ctx, 'GET', `/admin/questions?${s}`, { token }).then((r) => r.body.data.length);
    expect(await q('q=equality')).toBe(1);
    expect(await q('q=LANDLOCKED')).toBe(1);
    expect(await q('tag=Rights')).toBe(1);
    expect(await q('type=true_false')).toBe(1);
    expect(await q('pyq=true')).toBe(1);
    expect(await q('pyq=false')).toBe(1);
    const tags = await call(ctx, 'GET', '/admin/question-tags?q=rig', { token });
    expect(tags.body).toEqual([{ name: 'RIGHTS', questionCount: 1 }]);
    const detail = (await call(ctx, 'GET', '/admin/questions?pyq=true', { token })).body.data[0];
    const full = await call(ctx, 'GET', `/admin/questions/${detail.id}`, { token });
    expect(full.body.sources).toEqual([
      expect.objectContaining({ yearBs: 2079, examNodeName: { en: 'Nepal Police' } }),
    ]);
    expect(full.body.isPyq).toBe(true);
  });

  it('only accepts public media-library images and protects them from deletion while used', async () => {
    const token = await publisher(ctx);
    const { subjectId } = await subjectWithTopic(token);
    const image = (
      await upload(
        ctx,
        token,
        { name: 'map.png', contentType: 'image/png', data: await pngFixture(400, 200) },
        { visibility: 'public' },
      )
    ).body;
    const privateImage = (
      await upload(
        ctx,
        token,
        { name: 'p.png', contentType: 'image/png', data: await pngFixture(400, 200) },
        { visibility: 'private' },
      )
    ).body;
    const withImage = (mediaId: string) => {
      const body = mcq(subjectId);
      body.content = {
        ...body.content,
        stem: {
          en: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Map' }] },
              { type: 'image', attrs: { mediaId } },
            ],
          },
        },
      } as never;
      return body;
    };
    expect(
      (await call(ctx, 'POST', '/admin/questions', { token, body: withImage(privateImage.id) })).status,
    ).toBe(400);
    expect((await call(ctx, 'POST', '/admin/questions', { token, body: withImage(image.id) })).status).toBe(
      201,
    );
    expect((await call(ctx, 'DELETE', `/admin/media/${image.id}`, { token })).status).toBe(409);

    // Course descriptions count too (regression: they were not checked).
    const other = (
      await upload(
        ctx,
        token,
        { name: 'c.png', contentType: 'image/png', data: await pngFixture(400, 200) },
        { visibility: 'public' },
      )
    ).body;
    const course = (
      await call(ctx, 'POST', '/admin/courses', { token, body: { slug: 'c1', title: { en: 'C1' } } })
    ).body;
    const put = await call(ctx, 'PUT', `/admin/courses/${course.id}`, {
      token,
      body: {
        slug: 'c1',
        title: { en: 'C1' },
        description: { en: { type: 'doc', content: [{ type: 'image', attrs: { mediaId: other.id } }] } },
      },
    });
    expect(put.status).toBe(204);
    expect((await call(ctx, 'DELETE', `/admin/media/${other.id}`, { token })).status).toBe(409);
  });
});

describe('question reports', () => {
  it('lets students report published questions once, and staff resolve them', async () => {
    const token = await publisher(ctx);
    const { subjectId } = await subjectWithTopic(token);
    const draft = (await call(ctx, 'POST', '/admin/questions', { token, body: mcq(subjectId) })).body;
    const live = (await call(ctx, 'POST', '/admin/questions', { token, body: mcq(subjectId) })).body;
    await call(ctx, 'PUT', `/admin/questions/${live.id}/status`, { token, body: { status: 'published' } });
    const student = (await registerStudent(ctx, 'student@example.com')).accessToken;

    const report = (id: string) =>
      call(ctx, 'POST', `/questions/${id}/reports`, {
        token: student,
        body: { reason: 'wrong_answer', message: 'Should be B' },
      });
    expect((await report(draft.id)).status).toBe(404);
    expect((await report(live.id)).status).toBe(201);
    expect((await report(live.id)).status).toBe(409);
    expect(
      (await call(ctx, 'POST', `/questions/${live.id}/reports`, { token, body: { reason: 'typo' } })).status,
    ).toBe(403);

    const open = await call(ctx, 'GET', '/admin/question-reports', { token });
    expect(open.body.data).toEqual([
      expect.objectContaining({
        reason: 'wrong_answer',
        message: 'Should be B',
        status: 'open',
        reporter: 'Asha Rai',
      }),
    ]);
    expect((await call(ctx, 'GET', `/admin/questions/${live.id}`, { token })).body.openReports).toBe(1);

    const id = open.body.data[0].id;
    expect(
      (
        await call(ctx, 'PUT', `/admin/question-reports/${id}`, {
          token,
          body: { status: 'resolved', note: 'Fixed key' },
        })
      ).status,
    ).toBe(204);
    expect(
      (await call(ctx, 'PUT', `/admin/question-reports/${id}`, { token, body: { status: 'rejected' } }))
        .status,
    ).toBe(409);
    expect((await call(ctx, 'GET', '/admin/question-reports', { token })).body.data).toHaveLength(0);
    const resolved = await call(ctx, 'GET', '/admin/question-reports?status=resolved', { token });
    expect(resolved.body.data[0]).toMatchObject({
      resolutionNote: 'Fixed key',
      resolvedBy: expect.any(String),
    });

    // After resolution the student may report again.
    expect((await report(live.id)).status).toBe(201);
  });
});

describe('reference data for course and question editors', () => {
  it('lets course and question editors read categories, papers and subject outlines, but not change them', async () => {
    const token = await publisher(ctx);
    const { subjectId } = await subjectWithTopic(token);
    for (const [email, permission] of [
      ['qe@example.com', 'questions:edit'],
      ['ce@example.com', 'courses:edit'],
    ] as const) {
      await createStaff(ctx, email, { permissions: [permission] });
      const t = (await staffLogin(ctx, email)).token;
      expect((await call(ctx, 'GET', '/admin/exam-nodes', { token: t })).status, permission).toBe(200);
      expect((await call(ctx, 'GET', '/admin/papers', { token: t })).status, permission).toBe(200);
      expect((await call(ctx, 'GET', '/admin/subjects', { token: t })).status, permission).toBe(200);
      const create = await call(ctx, 'POST', '/admin/exam-nodes', {
        token: t,
        body: {
          parentId: null,
          nodeType: 'authority',
          name: { en: 'X' },
          slug: `x-${permission.split(':')[0]}`,
        },
      });
      expect(create.status, permission).toBe(403);
    }
    const qe = (await staffLogin(ctx, 'qe@example.com')).token;
    expect((await call(ctx, 'GET', `/admin/subjects/${subjectId}/tree`, { token: qe })).status).toBe(200);
  });
});
