import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { publisher } from './content-helpers.js';
import {
  call,
  createStaff,
  createTestApp,
  registerStudent,
  setSetting,
  staffLogin,
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

const node = (token: string, body: Record<string, unknown>) =>
  call(ctx, 'POST', '/admin/exam-nodes', { token, body: { parentId: null, ...body } });

describe('admin-managed category types (DYNAMIC_ADMIN_AUDIT §4.1)', () => {
  it('builds PSC-style hierarchies with sub-groups and exam stages, and links papers to stages', async () => {
    const token = await publisher(ctx);
    const created = await call(ctx, 'POST', '/admin/exam-node-types', {
      token,
      body: { key: 'zone', name: { en: 'Zone', ne: 'क्षेत्र' }, rank: 15 },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      key: 'zone',
      rank: 15,
      topLevel: false,
      active: true,
      nodeCount: 0,
    });

    const psc = (await node(token, { nodeType: 'authority', name: { en: 'Lok Sewa Aayog' }, slug: 'psc' }))
      .body;
    const service = (
      await node(token, {
        parentId: psc.id,
        nodeType: 'service',
        name: { en: 'Administration' },
        slug: 'admin',
      })
    ).body;
    const group = (
      await node(token, {
        parentId: service.id,
        nodeType: 'group',
        name: { en: 'General Admin' },
        slug: 'gen',
      })
    ).body;
    const sub = await node(token, {
      parentId: group.id,
      nodeType: 'sub_group',
      name: { en: 'Account' },
      slug: 'acct',
    });
    expect(sub.status).toBe(201);
    const post = (
      await node(token, {
        parentId: sub.body.id,
        nodeType: 'post',
        name: { en: 'Kharidar' },
        slug: 'kharidar',
      })
    ).body;
    const stage = await node(token, {
      parentId: post.id,
      nodeType: 'exam_stage',
      name: { en: 'Preliminary' },
      slug: 'kh-prelim',
    });
    expect(stage.status).toBe(201);

    // Order is enforced from the table: a group cannot sit under a post; a stage cannot be top level.
    const wrong = await node(token, { parentId: post.id, nodeType: 'group', name: { en: 'X' }, slug: 'x' });
    expect(wrong.status).toBe(400);
    expect(JSON.stringify(wrong.body)).toContain('A Group cannot be placed under a Post');
    expect((await node(token, { nodeType: 'exam_stage', name: { en: 'Y' }, slug: 'y' })).status).toBe(400);
    expect((await node(token, { nodeType: 'nonsense', name: { en: 'Z' }, slug: 'z' })).status).toBe(400);

    // Papers attach to any type that allows papers (here: the exam stage), not to services.
    const paper = await call(ctx, 'POST', '/admin/papers', {
      token,
      body: { name: { en: 'Paper I' }, postIds: [stage.body.id] },
    });
    expect(paper.status).toBe(201);
    const badPaper = await call(ctx, 'POST', '/admin/papers', {
      token,
      body: { name: { en: 'Paper II' }, postIds: [service.id] },
    });
    expect(badPaper.status).toBe(400);

    // Public list for apps: active types with names, no admin fields.
    const pub = await call(ctx, 'GET', '/exam-node-types');
    expect(pub.status).toBe(200);
    expect(pub.body.map((t: { key: string }) => t.key)).toEqual([
      'authority',
      'zone',
      'level',
      'service',
      'group',
      'sub_group',
      'post',
      'exam_stage',
    ]);
    expect(pub.body[0]).not.toHaveProperty('nodeCount');
  });

  it('protects existing categories when types change', async () => {
    const token = await publisher(ctx);
    const auth = (await node(token, { nodeType: 'authority', name: { en: 'Police' }, slug: 'police' })).body;
    const post = (
      await node(token, { parentId: auth.id, nodeType: 'post', name: { en: 'Constable' }, slug: 'constable' })
    ).body;
    await call(ctx, 'POST', '/admin/papers', { token, body: { name: { en: 'P1' }, postIds: [post.id] } });

    const type = (key: string, body: Record<string, unknown>) =>
      call(ctx, 'PUT', `/admin/exam-node-types/${key}`, { token, body: { key, name: { en: key }, ...body } });

    // Moving "post" above "authority" would break existing parent/child order.
    expect((await type('post', { rank: 5, canHavePapers: true })).status).toBe(409);
    // Posts have linked papers, so the papers flag cannot be removed.
    expect((await type('post', { rank: 60, canHavePapers: false })).status).toBe(409);
    // Existing posts have parents, so "post" cannot become top level.
    expect((await type('post', { rank: 60, canHavePapers: true, topLevel: true })).status).toBe(409);
    // Renaming and re-ranking within the gap is fine; nodes keep their type.
    const renamed = await type('post', { rank: 65, canHavePapers: true, name: { en: 'Position', ne: 'पद' } });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ rank: 65, nodeCount: 1 });
    expect(
      (
        await call(ctx, 'PUT', '/admin/exam-node-types/post', {
          token,
          body: { key: 'job', name: { en: 'x' }, rank: 65 },
        })
      ).status,
    ).toBe(400);

    // In-use types cannot be deleted, only turned off; turned-off types cannot be used for new categories.
    expect((await call(ctx, 'DELETE', '/admin/exam-node-types/post', { token })).status).toBe(409);
    expect((await type('exam_stage', { rank: 70, canHavePapers: true, active: false })).status).toBe(200);
    expect(
      (await node(token, { parentId: post.id, nodeType: 'exam_stage', name: { en: 'S' }, slug: 's' })).status,
    ).toBe(400);
    expect(
      (await call(ctx, 'GET', '/exam-node-types')).body.map((t: { key: string }) => t.key),
    ).not.toContain('exam_stage');
    expect((await call(ctx, 'DELETE', '/admin/exam-node-types/exam_stage', { token })).status).toBe(204);

    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityType: 'exam_node_type' } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['exam_node_type.update', 'exam_node_type.delete']));
  });

  it('lets only taxonomy managers change types', async () => {
    await createStaff(ctx, 'ce@example.com', { permissions: ['courses:edit'] });
    const t = (await staffLogin(ctx, 'ce@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/exam-node-types', { token: t })).status).toBe(200);
    const res = await call(ctx, 'POST', '/admin/exam-node-types', {
      token: t,
      body: { key: 'zone', name: { en: 'Zone' }, rank: 15 },
    });
    expect(res.status).toBe(403);
  });
});

describe('question types are switched on and off in settings (DYNAMIC_ADMIN_AUDIT §4.2)', () => {
  it('refuses new questions of a disabled type and publishes labels in /app/config', async () => {
    const token = await publisher(ctx);
    const subject = (await call(ctx, 'POST', '/admin/subjects', { token, body: { name: { en: 'S' } } })).body;
    const doc = {
      en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Q' }] }] },
    };
    const body = (content: Record<string, unknown>) => ({
      subjectId: subject.id,
      difficulty: 'easy',
      defaultMarks: 1,
      accessLevel: 'free',
      content: { stem: doc, ...content },
    });
    await setSetting(ctx, 'questions.types', {
      enabled: ['single_choice', 'true_false'],
      labels: { true_false: { en: 'Right or wrong', ne: 'सही वा गलत' } },
    });
    const off = await call(ctx, 'POST', '/admin/questions', {
      token,
      body: body({ type: 'numeric', value: 4 }),
    });
    expect(off.status).toBe(400);
    expect(JSON.stringify(off.body)).toContain('turned off');
    expect(
      (
        await call(ctx, 'POST', '/admin/questions', {
          token,
          body: body({ type: 'true_false', correct: true }),
        })
      ).status,
    ).toBe(201);

    await registerStudent(ctx, 'student@example.com');
    const config = await call(ctx, 'GET', '/app/config');
    expect(config.body.enabledQuestionTypes).toEqual(['single_choice', 'true_false']);
    expect(config.body.questionTypeLabels).toEqual({
      true_false: { en: 'Right or wrong', ne: 'सही वा गलत' },
    });
  });
});
