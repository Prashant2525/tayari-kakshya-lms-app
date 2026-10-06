import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  call,
  createTestApp,
  device,
  PASSWORD,
  registerStudent,
  setSetting,
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

describe('registration', () => {
  it('creates a student, opens a session and sends a verification code', async () => {
    const tokens = await registerStudent(ctx, 'Asha@Example.com');
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toMatch(/^rt_/);

    const me = await call(ctx, 'GET', '/me', { token: tokens.accessToken });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      kind: 'student',
      email: 'asha@example.com',
      emailVerified: false,
      permissions: [],
    });
    expect(ctx.mail.outbox.at(-1)?.to).toBe('asha@example.com');

    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('gives each account a stable analytics pseudonym that reveals nothing about it', async () => {
    const asha = await registerStudent(ctx, 'asha@example.com');
    const ram = await registerStudent(ctx, 'ram@example.com');
    const first = (await call(ctx, 'GET', '/me', { token: asha.accessToken })).body;
    const again = (await call(ctx, 'GET', '/me', { token: asha.accessToken })).body;
    const other = (await call(ctx, 'GET', '/me', { token: ram.accessToken })).body;
    expect(first.analyticsId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(again.analyticsId).toBe(first.analyticsId);
    expect(other.analyticsId).not.toBe(first.analyticsId);
    for (const value of [first.id, first.id.replaceAll('-', ''), first.email, first.fullName]) {
      expect(first.analyticsId).not.toContain(value);
    }
  });

  it('rejects a duplicate email regardless of case', async () => {
    await registerStudent(ctx, 'asha@example.com');
    const res = await call(ctx, 'POST', '/auth/register', {
      body: {
        fullName: 'Other',
        email: 'ASHA@example.com',
        password: PASSWORD,
        acceptTerms: true,
        device: device(),
      },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('returns structured validation errors with a request id', async () => {
    const res = await call(ctx, 'POST', '/auth/register', { body: { email: 'not-an-email' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'email' })]),
    );
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });
});

describe('login', () => {
  it('rejects a wrong password and an unknown email with the same error', async () => {
    await registerStudent(ctx);
    const wrong = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'asha@example.com', password: 'nope-nope', device: device() },
    });
    const unknown = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'nobody@example.com', password: 'nope-nope', device: device() },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('does not let staff log in through the student endpoint', async () => {
    await ctx.prisma.user.create({ data: { kind: 'staff', email: 'staff@example.com', fullName: 'Staff' } });
    const res = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'staff@example.com', password: PASSWORD, device: device() },
    });
    expect(res.status).toBe(401);
  });

  it('blocks suspended accounts', async () => {
    await registerStudent(ctx);
    await ctx.prisma.user.update({ where: { email: 'asha@example.com' }, data: { status: 'suspended' } });
    const res = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'asha@example.com', password: PASSWORD, device: device() },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('rate limits repeated attempts against one account', async () => {
    await registerStudent(ctx);
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (
        await call(ctx, 'POST', '/auth/login', {
          body: { email: 'asha@example.com', password: 'wrong-password', device: device() },
        })
      ).status;
    }
    expect(last).toBe(429);
  });

  it('limits every route to RATE_LIMIT_DEFAULT_PER_MINUTE requests per IP (300 by default)', async () => {
    // Counting is per calendar minute: pin the clock to the start of one so the test cannot straddle two.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-06T06:00:00Z') });
    try {
      for (let i = 0; i < 300; i++) {
        expect((await call(ctx, 'GET', '/exam-node-types', { ip: '203.0.113.7' })).status).toBe(200);
      }
      const refused = await call(ctx, 'GET', '/exam-node-types', { ip: '203.0.113.7' });
      expect(refused.status).toBe(429);
      expect(refused.body.error.code).toBe('RATE_LIMITED');
      expect((await call(ctx, 'GET', '/exam-node-types', { ip: '203.0.113.8' })).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('refresh tokens', () => {
  it('rotates tokens on every refresh', async () => {
    const first = await registerStudent(ctx);
    const res = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: first.refreshToken } });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(first.refreshToken);
    expect(res.body.sessionId).toBe(first.sessionId);
    expect((await call(ctx, 'GET', '/me', { token: res.body.accessToken })).status).toBe(200);
  });

  it('treats reuse of a rotated token as theft and revokes the session', async () => {
    const first = await registerStudent(ctx);
    const second = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: first.refreshToken } });

    const replay = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: first.refreshToken } });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // The legitimate holder's newer token and access token stop working too.
    const after = await call(ctx, 'POST', '/auth/refresh', {
      body: { refreshToken: second.body.refreshToken },
    });
    expect(after.status).toBe(401);
    expect((await call(ctx, 'GET', '/me', { token: second.body.accessToken })).status).toBe(401);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'auth.refresh_token_reuse' } })).toBe(1);
  });

  it('rejects unknown tokens', async () => {
    const res = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: 'rt_' + 'x'.repeat(43) } });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });
});

describe('logout and sessions', () => {
  it('logout invalidates the access token immediately', async () => {
    const tokens = await registerStudent(ctx);
    expect((await call(ctx, 'POST', '/auth/logout', { token: tokens.accessToken })).status).toBe(204);
    const me = await call(ctx, 'GET', '/me', { token: tokens.accessToken });
    expect(me.status).toBe(401);
    expect(
      (await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: tokens.refreshToken } })).status,
    ).toBe(401);
  });

  it('lists sessions and lets the user sign out another device', async () => {
    const phone = await registerStudent(ctx, 'asha@example.com', device('Phone'));
    const tablet = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'asha@example.com', password: PASSWORD, device: device('Tablet') },
    });
    const list = await call(ctx, 'GET', '/me/sessions', { token: phone.accessToken });
    expect(list.body).toHaveLength(2);
    expect(list.body.find((s: { current: boolean }) => s.current).deviceName).toBe('Phone');

    const del = await call(ctx, 'DELETE', `/me/sessions/${tablet.body.sessionId}`, {
      token: phone.accessToken,
    });
    expect(del.status).toBe(204);
    expect((await call(ctx, 'GET', '/me', { token: tablet.body.accessToken })).status).toBe(401);
  });

  it('cannot sign out sessions of another user', async () => {
    const a = await registerStudent(ctx, 'a@example.com');
    const b = await registerStudent(ctx, 'b@example.com');
    const res = await call(ctx, 'DELETE', `/me/sessions/${b.sessionId}`, { token: a.accessToken });
    expect(res.status).toBe(404);
    expect((await call(ctx, 'GET', '/me', { token: b.accessToken })).status).toBe(200);
  });

  it('re-login on the same device replaces the old session', async () => {
    const dev = device('Phone');
    const first = await registerStudent(ctx, 'asha@example.com', dev);
    const again = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'asha@example.com', password: PASSWORD, device: dev },
    });
    expect(again.status).toBe(200);
    expect((await call(ctx, 'GET', '/me', { token: first.accessToken })).status).toBe(401);
  });
});

describe('device limit (D-028)', () => {
  it('is not enforced until configured', async () => {
    await registerStudent(ctx);
    for (let i = 0; i < 3; i++) {
      const res = await call(ctx, 'POST', '/auth/login', {
        body: { email: 'asha@example.com', password: PASSWORD, device: device() },
      });
      expect(res.status).toBe(200);
    }
  });

  it('blocks a new device at the limit and lets the user replace a named session', async () => {
    await setSetting(ctx, 'auth.deviceLimit', { maxActiveSessions: 1, onLimit: 'block' });
    const phone = await registerStudent(ctx, 'asha@example.com', device('Phone'));

    const blocked = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'asha@example.com', password: PASSWORD, device: device('Tablet') },
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DEVICE_LIMIT_REACHED');
    expect(blocked.body.error.details.sessions).toEqual([
      expect.objectContaining({ id: phone.sessionId, deviceName: 'Phone' }),
    ]);

    const replaced = await call(ctx, 'POST', '/auth/login', {
      body: {
        email: 'asha@example.com',
        password: PASSWORD,
        device: device('Tablet'),
        replaceSessionId: phone.sessionId,
      },
    });
    expect(replaced.status).toBe(200);
    expect((await call(ctx, 'GET', '/me', { token: phone.accessToken })).status).toBe(401);
  });

  it('can revoke the oldest session instead of blocking, and honours per-user overrides', async () => {
    await setSetting(ctx, 'auth.deviceLimit', { maxActiveSessions: 1, onLimit: 'revoke_oldest' });
    const phone = await registerStudent(ctx, 'asha@example.com', device('Phone'));
    const tablet = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'asha@example.com', password: PASSWORD, device: device('Tablet') },
    });
    expect(tablet.status).toBe(200);
    expect((await call(ctx, 'GET', '/me', { token: phone.accessToken })).status).toBe(401);

    await ctx.prisma.user.update({ where: { email: 'asha@example.com' }, data: { deviceLimitOverride: 2 } });
    const laptop = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'asha@example.com', password: PASSWORD, device: device('Laptop') },
    });
    expect(laptop.status).toBe(200);
    expect((await call(ctx, 'GET', '/me', { token: tablet.body.accessToken })).status).toBe(200);
  });
});

describe('profile', () => {
  it('updates allowed fields and rejects unknown ones', async () => {
    const { accessToken } = await registerStudent(ctx);
    const ok = await call(ctx, 'PATCH', '/me', {
      token: accessToken,
      body: { fullName: 'Asha K. Rai', dob: '2001-05-14', locale: 'ne' },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ fullName: 'Asha K. Rai', dob: '2001-05-14', locale: 'ne' });

    const escalation = await call(ctx, 'PATCH', '/me', { token: accessToken, body: { kind: 'staff' } });
    expect(escalation.status).toBe(400);
  });

  it('changes the password and signs out other devices', async () => {
    const phone = await registerStudent(ctx, 'asha@example.com', device('Phone'));
    const tablet = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'asha@example.com', password: PASSWORD, device: device('Tablet') },
    });
    const wrong = await call(ctx, 'POST', '/me/password', {
      token: phone.accessToken,
      body: { currentPassword: 'not-it', newPassword: 'a brand new password' },
    });
    expect(wrong.status).toBe(401);

    const ok = await call(ctx, 'POST', '/me/password', {
      token: phone.accessToken,
      body: { currentPassword: PASSWORD, newPassword: 'a brand new password' },
    });
    expect(ok.status).toBe(204);
    expect((await call(ctx, 'GET', '/me', { token: phone.accessToken })).status).toBe(200);
    expect((await call(ctx, 'GET', '/me', { token: tablet.body.accessToken })).status).toBe(401);
  });
});
