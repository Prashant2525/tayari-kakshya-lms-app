import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/modules/auth/account-deletion.service.js';
import { publisher } from './content-helpers.js';
import { call, createTestApp, registerStudent, type TestContext } from './helpers.js';

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

async function node(token: string, parentId: string | null, nodeType: string, en: string, publish = true) {
  const res = await call(ctx, 'POST', '/admin/exam-nodes', {
    token,
    body: { parentId, nodeType, name: { en }, slug: en.toLowerCase().replace(/\s+/g, '-') },
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  if (publish) {
    await call(ctx, 'PUT', `/admin/exam-nodes/${res.body.id}/status`, {
      token,
      body: { status: 'published' },
    });
  }
  return res.body.id as string;
}

async function setup() {
  const admin = await publisher(ctx);
  const army = await node(admin, null, 'authority', 'Nepal Army');
  const sainey = await node(admin, army, 'post', 'Sainey Likhit');
  const cadet = await node(admin, army, 'post', 'Officer Cadet');
  const draft = await node(admin, army, 'post', 'Draft post', false);
  const student = (await registerStudent(ctx, 'aarati@example.com')).accessToken;
  return { admin, army, sainey, cadet, draft, student };
}

describe('student target posts (onboarding, S1)', () => {
  it('saves the chosen categories in order and returns each with its path', async () => {
    const { student, army, sainey, cadet } = await setup();
    expect((await call(ctx, 'GET', '/me/target-posts', { token: student })).body).toEqual([]);

    const put = await call(ctx, 'PUT', '/me/target-posts', {
      token: student,
      body: { examNodeIds: [cadet, sainey] },
    });
    expect(put.status).toBe(200);
    expect(put.body.map((p: { id: string }) => p.id)).toEqual([cadet, sainey]);
    expect(put.body[1]).toMatchObject({
      name: { en: 'Sainey Likhit' },
      nodeType: 'post',
      path: [{ id: army, nodeType: 'authority', name: { en: 'Nepal Army' } }],
    });

    // Replacing the list removes the old choices.
    await call(ctx, 'PUT', '/me/target-posts', { token: student, body: { examNodeIds: [sainey] } });
    const get = await call(ctx, 'GET', '/me/target-posts', { token: student });
    expect(get.body.map((p: { id: string }) => p.id)).toEqual([sainey]);
    expect(
      (await call(ctx, 'PUT', '/me/target-posts', { token: student, body: { examNodeIds: [] } })).body,
    ).toEqual([]);
  });

  it('refuses unpublished, unknown and duplicate categories', async () => {
    const { student, sainey, draft } = await setup();
    const unpublished = await call(ctx, 'PUT', '/me/target-posts', {
      token: student,
      body: { examNodeIds: [sainey, draft] },
    });
    expect(unpublished.status).toBe(400);
    expect(JSON.stringify(unpublished.body)).toContain(`Category ${draft} is not available`);
    const unknown = await call(ctx, 'PUT', '/me/target-posts', {
      token: student,
      body: { examNodeIds: ['0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b'] },
    });
    expect(unknown.status).toBe(400);
    const duplicate = await call(ctx, 'PUT', '/me/target-posts', {
      token: student,
      body: { examNodeIds: [sainey, sainey] },
    });
    expect(duplicate.status).toBe(400);
    const tooMany = await call(ctx, 'PUT', '/me/target-posts', {
      token: student,
      body: { examNodeIds: Array.from({ length: 6 }, (_, i) => `0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6${i}`) },
    });
    expect(tooMany.status).toBe(400);
    expect((await call(ctx, 'GET', '/me/target-posts', { token: student })).body).toEqual([]);
  });

  it('hides a choice once its category or an ancestor is unpublished', async () => {
    const { admin, student, army, sainey } = await setup();
    await call(ctx, 'PUT', '/me/target-posts', { token: student, body: { examNodeIds: [sainey] } });
    await call(ctx, 'PUT', `/admin/exam-nodes/${army}/status`, { token: admin, body: { status: 'draft' } });
    expect((await call(ctx, 'GET', '/me/target-posts', { token: student })).body).toEqual([]);
  });

  it('is for signed-in students only', async () => {
    const { admin } = await setup();
    expect((await call(ctx, 'GET', '/me/target-posts')).status).toBe(401);
    expect((await call(ctx, 'GET', '/me/target-posts', { token: admin })).status).toBe(403);
  });

  it('public category listing reports how many published children each node has', async () => {
    const { army } = await setup();
    const roots = await call(ctx, 'GET', '/exam-nodes');
    expect(roots.body).toEqual([expect.objectContaining({ id: army, childCount: 2 })]);
    const posts = await call(ctx, 'GET', `/exam-nodes?parentId=${army}`);
    expect(posts.body.map((n: { childCount: number }) => n.childCount)).toEqual([0, 0]);
  });

  it('erasing an account removes its target posts (D-032)', async () => {
    const { student, sainey } = await setup();
    await call(ctx, 'PUT', '/me/target-posts', { token: student, body: { examNodeIds: [sainey] } });
    await call(ctx, 'POST', '/me/deletion', { token: student });
    const erased = await ctx.app
      .get(AccountDeletionService)
      .processDue(new Date(Date.now() + 60 * 86_400_000));
    expect(erased).toBe(1);
    expect(await ctx.prisma.userTargetPost.count()).toBe(0);
  });
});
