import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  call,
  createStaff,
  createTestApp,
  registerStudent,
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

async function editor() {
  await createStaff(ctx, 'editor@example.com', { permissions: ['education_levels:manage'] });
  return (await staffLogin(ctx, 'editor@example.com')).token;
}

describe('education levels (D-031)', () => {
  it('requires the permission', async () => {
    await createStaff(ctx, 'reader@example.com', { permissions: ['users:read'] });
    const { token } = await staffLogin(ctx, 'reader@example.com');
    expect((await call(ctx, 'GET', '/admin/education-levels', { token })).status).toBe(403);
  });

  it('creates bilingual levels, lists only active ones publicly, in order', async () => {
    const token = await editor();
    const a = await call(ctx, 'POST', '/admin/education-levels', {
      token,
      body: { name: { en: 'SEE', ne: 'एसईई' } },
    });
    const b = await call(ctx, 'POST', '/admin/education-levels', { token, body: { name: { en: '+2' } } });
    const c = await call(ctx, 'POST', '/admin/education-levels', {
      token,
      body: { name: { en: 'Old' }, active: false },
    });
    expect([a.status, b.status, c.status]).toEqual([201, 201, 201]);
    expect((await call(ctx, 'POST', '/admin/education-levels', { token, body: { name: {} } })).status).toBe(
      400,
    );

    const reorder = await call(ctx, 'PUT', '/admin/education-levels/order', {
      token,
      body: { ids: [b.body.id, a.body.id, c.body.id] },
    });
    expect(reorder.status).toBe(200);
    const pub = await call(ctx, 'GET', '/education-levels');
    expect(pub.body.map((l: { name: { en: string } }) => l.name.en)).toEqual(['+2', 'SEE']);

    const partial = await call(ctx, 'PUT', '/admin/education-levels/order', {
      token,
      body: { ids: [a.body.id] },
    });
    expect(partial.status).toBe(400);
  });

  it('lets students choose an active level and protects levels in use', async () => {
    const token = await editor();
    const level = await call(ctx, 'POST', '/admin/education-levels', {
      token,
      body: { name: { en: 'Bachelor' } },
    });
    const student = await registerStudent(ctx);
    const set = await call(ctx, 'PATCH', '/me', {
      token: student.accessToken,
      body: { educationLevelId: level.body.id },
    });
    expect(set.status).toBe(200);
    expect(set.body.educationLevelId).toBe(level.body.id);

    const del = await call(ctx, 'DELETE', `/admin/education-levels/${level.body.id}`, { token });
    expect(del.status).toBe(409);

    await call(ctx, 'PUT', `/admin/education-levels/${level.body.id}`, {
      token,
      body: { name: { en: 'Bachelor' }, active: false },
    });
    const inactive = await call(ctx, 'PATCH', '/me', {
      token: student.accessToken,
      body: { educationLevelId: level.body.id },
    });
    expect(inactive.status).toBe(400);
    expect(await ctx.prisma.auditLog.count({ where: { entityType: 'education_level' } })).toBe(2);
  });
});
