import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_HEADERS,
  call,
  createStaff,
  createTestApp,
  lastEmailCode,
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

describe('staff authentication (cookie refresh)', () => {
  it('logs in with an HttpOnly, SameSite=Strict refresh cookie scoped to the auth path', async () => {
    await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const res = await call(ctx, 'POST', '/admin/auth/login', {
      body: { email: 'admin@example.com', password: 'correct horse battery' },
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = res.cookies.find((c) => c.name === 'tk_admin_rt');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/v1/admin/auth' });
  });

  it('requires the admin client header (CSRF defence) on cookie endpoints', async () => {
    await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { refreshCookie } = await staffLogin(ctx, 'admin@example.com');
    const noHeader = await call(ctx, 'POST', '/admin/auth/refresh', {
      headers: { cookie: `tk_admin_rt=${refreshCookie}` },
    });
    expect(noHeader.status).toBe(403);
    const ok = await call(ctx, 'POST', '/admin/auth/refresh', {
      headers: { ...ADMIN_HEADERS, cookie: `tk_admin_rt=${refreshCookie}` },
    });
    expect(ok.status).toBe(200);
    expect(ok.cookies.find((c) => c.name === 'tk_admin_rt')?.value).not.toBe(refreshCookie);
  });

  it('keeps students and staff apart', async () => {
    await registerStudent(ctx, 'student@example.com');
    const staffViaAdmin = await call(ctx, 'POST', '/admin/auth/login', {
      body: { email: 'student@example.com', password: 'correct horse battery' },
      headers: ADMIN_HEADERS,
    });
    expect(staffViaAdmin.status).toBe(401);

    const student = await registerStudent(ctx, 'other@example.com');
    const adminRoute = await call(ctx, 'GET', '/admin/users', { token: student.accessToken });
    expect(adminRoute.status).toBe(403);
  });

  it('staff tokens cannot use student refresh, and student refresh tokens cannot be used by staff endpoints', async () => {
    await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { refreshCookie } = await staffLogin(ctx, 'admin@example.com');
    const asStudent = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: refreshCookie } });
    expect(asStudent.status).toBe(401);

    const student = await registerStudent(ctx);
    const asStaff = await call(ctx, 'POST', '/admin/auth/refresh', {
      headers: { ...ADMIN_HEADERS, cookie: `tk_admin_rt=${student.refreshToken}` },
    });
    expect(asStaff.status).toBe(401);
  });
});

describe('permissions', () => {
  it('denies staff without the required permission and allows those with it', async () => {
    await createStaff(ctx, 'reader@example.com', { permissions: ['audit:read'] });
    const { token } = await staffLogin(ctx, 'reader@example.com');
    expect((await call(ctx, 'GET', '/admin/audit-logs', { token })).status).toBe(200);
    expect((await call(ctx, 'GET', '/admin/users', { token })).status).toBe(403);
    expect(
      (await call(ctx, 'PUT', '/admin/settings/app.maintenance', { token, body: { value: {} } })).status,
    ).toBe(403);
  });

  it('exposes the caller permissions on /me for the CMS', async () => {
    await createStaff(ctx, 'reader@example.com', { permissions: ['audit:read', 'users:read'] });
    const { token } = await staffLogin(ctx, 'reader@example.com');
    const me = await call(ctx, 'GET', '/me', { token });
    expect(me.body).toMatchObject({ kind: 'staff', permissions: ['audit:read', 'users:read'] });
  });
});

describe('roles and privilege escalation', () => {
  it('a role manager cannot create or assign roles with permissions they do not hold', async () => {
    await createStaff(ctx, 'manager@example.com', {
      permissions: ['roles:manage', 'staff:manage', 'users:read'],
    });
    const { token } = await staffLogin(ctx, 'manager@example.com');

    const escalate = await call(ctx, 'POST', '/admin/roles', {
      token,
      body: { name: 'Sneaky', permissions: ['users:read', 'settings:update'] },
    });
    expect(escalate.status).toBe(403);
    expect(escalate.body.error.details.missing).toEqual(['settings:update']);

    const fine = await call(ctx, 'POST', '/admin/roles', {
      token,
      body: { name: 'Reader', permissions: ['users:read'] },
    });
    expect(fine.status).toBe(201);

    const superRole = await ctx.prisma.role.findFirstOrThrow({
      where: { isSystem: false, name: { startsWith: 'role-' } },
    });
    const target = await createStaff(ctx, 'target@example.com');
    const assignOwnRole = await call(ctx, 'PUT', `/admin/staff/${target.id}/roles`, {
      token,
      body: { roleIds: [superRole.id] },
    });
    expect(assignOwnRole.status).toBe(204);
  });

  it('only a Super Admin can grant the Super Admin role', async () => {
    const { RbacService } = await import('../src/modules/rbac/rbac.service.js');
    const superRole = await ctx.app.get(RbacService).ensureSuperAdminRole();
    await createStaff(ctx, 'manager@example.com', { permissions: ['staff:manage'] });
    const target = await createStaff(ctx, 'target@example.com');
    const { token } = await staffLogin(ctx, 'manager@example.com');
    const res = await call(ctx, 'PUT', `/admin/staff/${target.id}/roles`, {
      token,
      body: { roleIds: [superRole.id] },
    });
    expect(res.status).toBe(403);
  });

  it('protects the Super Admin role and the last Super Admin', async () => {
    const admin = await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { token } = await staffLogin(ctx, 'admin@example.com');
    const superRole = await ctx.prisma.role.findFirstOrThrow({ where: { isSystem: true } });

    expect((await call(ctx, 'DELETE', `/admin/roles/${superRole.id}`, { token })).body.error.code).toBe(
      'SUPER_ADMIN_PROTECTED',
    );
    expect(
      (
        await call(ctx, 'PUT', `/admin/roles/${superRole.id}`, {
          token,
          body: { name: 'x1', permissions: [] },
        })
      ).body.error.code,
    ).toBe('SUPER_ADMIN_PROTECTED');

    const demoteSelf = await call(ctx, 'PUT', `/admin/staff/${admin.id}/roles`, {
      token,
      body: { roleIds: [] },
    });
    expect(demoteSelf.status).toBe(409);
    expect(demoteSelf.body.error.code).toBe('SUPER_ADMIN_PROTECTED');
    expect((await call(ctx, 'PATCH', `/admin/staff/${admin.id}/suspend`, { token })).status).toBe(403);
  });

  it('refuses to delete a role that is still assigned', async () => {
    await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { token } = await staffLogin(ctx, 'admin@example.com');
    const role = await call(ctx, 'POST', '/admin/roles', {
      token,
      body: { name: 'Editors', permissions: ['users:read'] },
    });
    const target = await createStaff(ctx, 'editor@example.com');
    await call(ctx, 'PUT', `/admin/staff/${target.id}/roles`, { token, body: { roleIds: [role.body.id] } });
    const del = await call(ctx, 'DELETE', `/admin/roles/${role.body.id}`, { token });
    expect(del.status).toBe(409);
  });
});

describe('staff invitations', () => {
  it('creates a staff member without a password and emails a setup code that works', async () => {
    await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { token } = await staffLogin(ctx, 'admin@example.com');
    const res = await call(ctx, 'POST', '/admin/staff', {
      token,
      body: { fullName: 'New Editor', email: 'editor@example.com', roleIds: [] },
    });
    expect(res.status).toBe(201);

    const code = lastEmailCode(ctx, 'editor@example.com');
    const set = await call(ctx, 'POST', '/auth/password/reset', {
      body: { email: 'editor@example.com', code, newPassword: 'editor password 1' },
    });
    expect(set.status).toBe(204);
    const login = await call(ctx, 'POST', '/admin/auth/login', {
      body: { email: 'editor@example.com', password: 'editor password 1' },
      headers: ADMIN_HEADERS,
    });
    expect(login.status).toBe(200);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'staff.create' } })).toBe(1);
  });
});

describe('student administration', () => {
  it('suspends a student, revoking their sessions, and audits it', async () => {
    await createStaff(ctx, 'support@example.com', { permissions: ['users:read', 'users:suspend'] });
    const { token } = await staffLogin(ctx, 'support@example.com');
    const student = await registerStudent(ctx, 'asha@example.com');
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });

    const list = await call(ctx, 'GET', '/admin/users?q=asha', { token });
    expect(list.body.data).toHaveLength(1);

    expect((await call(ctx, 'POST', `/admin/users/${user.id}/suspend`, { token })).status).toBe(204);
    const me = await call(ctx, 'GET', '/me', { token: student.accessToken });
    expect(me.status).toBe(401);
    const audit = await call(ctx, 'GET', `/admin/audit-logs?entityId=${user.id}`, {
      token: (await staffLogin(ctx, 'support@example.com')).token,
    });
    expect(audit.status).toBe(403); // support lacks audit:read
    expect(await ctx.prisma.auditLog.count({ where: { action: 'student.suspend', entityId: user.id } })).toBe(
      1,
    );
  });

  it('paginates students with an opaque cursor', async () => {
    await createStaff(ctx, 'support@example.com', { permissions: ['users:read'] });
    const { token } = await staffLogin(ctx, 'support@example.com');
    for (const n of [1, 2, 3]) await registerStudent(ctx, `s${n}@example.com`);
    const page1 = await call(ctx, 'GET', '/admin/users?limit=2', { token });
    expect(page1.body.data).toHaveLength(2);
    const page2 = await call(ctx, 'GET', `/admin/users?limit=2&cursor=${page1.body.nextCursor}`, { token });
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();
    expect((await call(ctx, 'GET', '/admin/users?cursor=not-a-uuid', { token })).status).toBe(400);
  });
});

describe('settings and maintenance mode', () => {
  it('validates and audits settings changes', async () => {
    const admin = await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { token } = await staffLogin(ctx, 'admin@example.com');
    const bad = await call(ctx, 'PUT', '/admin/settings/auth.deviceLimit', {
      token,
      body: { value: { maxActiveSessions: 0, onLimit: 'block' } },
    });
    expect(bad.status).toBe(400);
    expect(
      (await call(ctx, 'PUT', '/admin/settings/no.such.key', { token, body: { value: 1 } })).status,
    ).toBe(404);

    const ok = await call(ctx, 'PUT', '/admin/settings/auth.deviceLimit', {
      token,
      body: { value: { maxActiveSessions: 2, onLimit: 'block' } },
    });
    expect(ok.status).toBe(200);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'settings.update' } });
    expect(log).toMatchObject({ actorUserId: admin.id, entityId: 'auth.deviceLimit' });
    expect(log.changes).toMatchObject({ after: { maxActiveSessions: 2 } });
  });

  it('blocks student routes during maintenance but keeps admin, health and app config available', async () => {
    await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { token } = await staffLogin(ctx, 'admin@example.com');
    const student = await registerStudent(ctx);
    await call(ctx, 'PUT', '/admin/settings/app.maintenance', {
      token,
      body: { value: { enabled: true, message: { en: 'Back soon', ne: 'छिट्टै फर्कन्छौं' } } },
    });

    const blocked = await call(ctx, 'GET', '/me', { token: student.accessToken });
    expect(blocked.status).toBe(503);
    expect(blocked.body.error.code).toBe('MAINTENANCE_MODE');
    expect((await call(ctx, 'GET', '/app/config')).body.maintenance.enabled).toBe(true);
    expect((await call(ctx, 'GET', '/health/live')).status).toBe(200);
    expect((await call(ctx, 'GET', '/admin/settings', { token })).status).toBe(200);
  });
});
