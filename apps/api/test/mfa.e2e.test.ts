import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { base32Decode, hotp, timeStep } from '../src/modules/auth/totp.js';
import {
  ADMIN_HEADERS,
  call,
  createStaff,
  createTestApp,
  PASSWORD,
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

const codeAt = (secret: string, offsetSteps = 0) =>
  hotp(base32Decode(secret), timeStep(Date.now()) + offsetSteps);

/** Enrols the signed-in staff member and returns the TOTP secret and recovery codes. */
async function enrol(token: string) {
  const setup = await call(ctx, 'POST', '/admin/me/mfa/setup', { token });
  expect(setup.status).toBe(200);
  const enable = await call(ctx, 'POST', '/admin/me/mfa/enable', {
    token,
    body: { code: codeAt(setup.body.secret) },
  });
  expect(enable.status).toBe(200);
  return { secret: setup.body.secret as string, recoveryCodes: enable.body.recoveryCodes as string[] };
}

describe('MFA enforcement policy', () => {
  it('forces a Super Admin to enrol before using permission-protected endpoints', async () => {
    await setSetting(ctx, 'auth.staffMfa', { requiredFor: 'super_admins' });
    await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { token } = await staffLogin(ctx, 'admin@example.com');

    const blocked = await call(ctx, 'GET', '/admin/users', { token });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('MFA_SETUP_REQUIRED');
    expect((await call(ctx, 'GET', '/me', { token })).body).toMatchObject({
      mfaEnabled: false,
      mfaSetupRequired: true,
      isSuperAdmin: true,
    });

    const setup = await call(ctx, 'POST', '/admin/me/mfa/setup', { token });
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    const wrong = await call(ctx, 'POST', '/admin/me/mfa/enable', { token, body: { code: '000000' } });
    expect(wrong.body.error.code).toBe('MFA_INVALID');

    const enable = await call(ctx, 'POST', '/admin/me/mfa/enable', {
      token,
      body: { code: codeAt(setup.body.secret) },
    });
    expect(enable.body.recoveryCodes).toHaveLength(10);
    expect((await call(ctx, 'GET', '/admin/users', { token })).status).toBe(200);
  });

  it('does not force other staff under the super_admins policy, but does under all_staff', async () => {
    await setSetting(ctx, 'auth.staffMfa', { requiredFor: 'super_admins' });
    await createStaff(ctx, 'reader@example.com', { permissions: ['users:read'] });
    const { token } = await staffLogin(ctx, 'reader@example.com');
    expect((await call(ctx, 'GET', '/admin/users', { token })).status).toBe(200);

    await setSetting(ctx, 'auth.staffMfa', { requiredFor: 'all_staff' });
    expect((await call(ctx, 'GET', '/admin/users', { token })).body.error.code).toBe('MFA_SETUP_REQUIRED');
  });

  it('stores the TOTP secret encrypted', async () => {
    const staff = await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { token } = await staffLogin(ctx, 'admin@example.com');
    const { secret } = await enrol(token);
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(row.mfaSecretEnc).toMatch(/^v1\./);
    expect(row.mfaSecretEnc).not.toContain(secret);
  });
});

describe('MFA login', () => {
  it('requires a second step and accepts each authenticator code only once', async () => {
    await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { secret } = await enrol((await staffLogin(ctx, 'admin@example.com')).token);

    const step1 = await call(ctx, 'POST', '/admin/auth/login', {
      body: { email: 'admin@example.com', password: PASSWORD },
      headers: ADMIN_HEADERS,
    });
    expect(step1.status).toBe(200);
    expect(step1.body).toMatchObject({ mfaRequired: true });
    expect(step1.body.accessToken).toBeUndefined();
    expect(step1.cookies.find((c) => c.name === 'tk_admin_rt')).toBeUndefined();

    // The challenge is not an access token.
    expect((await call(ctx, 'GET', '/me', { token: step1.body.mfaToken })).status).toBe(401);

    const code = codeAt(secret, 1); // next step: enrolment already consumed the current one
    const step2 = await call(ctx, 'POST', '/admin/auth/login/mfa', {
      body: { mfaToken: step1.body.mfaToken, code },
      headers: ADMIN_HEADERS,
    });
    expect(step2.status).toBe(200);
    expect(step2.body.accessToken).toBeTruthy();
    expect(step2.cookies.find((c) => c.name === 'tk_admin_rt')).toBeTruthy();

    const replay = await call(ctx, 'POST', '/admin/auth/login/mfa', {
      body: { mfaToken: step1.body.mfaToken, code },
      headers: ADMIN_HEADERS,
    });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('MFA_INVALID');
  });

  it('accepts each recovery code once and audits its use', async () => {
    await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { recoveryCodes } = await enrol((await staffLogin(ctx, 'admin@example.com')).token);
    const recovery = recoveryCodes[0]!;

    const login = async () =>
      call(ctx, 'POST', '/admin/auth/login', {
        body: { email: 'admin@example.com', password: PASSWORD },
        headers: ADMIN_HEADERS,
      });
    const first = await call(ctx, 'POST', '/admin/auth/login/mfa', {
      body: { mfaToken: (await login()).body.mfaToken, code: recovery.toUpperCase() },
      headers: ADMIN_HEADERS,
    });
    expect(first.status).toBe(200);
    const second = await call(ctx, 'POST', '/admin/auth/login/mfa', {
      body: { mfaToken: (await login()).body.mfaToken, code: recovery },
      headers: ADMIN_HEADERS,
    });
    expect(second.status).toBe(401);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'auth.mfa_recovery_code_used' } })).toBe(1);
  });

  it('rejects forged challenges', async () => {
    const res = await call(ctx, 'POST', '/admin/auth/login/mfa', {
      body: { mfaToken: 'eyJhbGciOiJIUzI1NiJ9.e30.forged-signature-value', code: '123456' },
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(401);
  });

  it('can be disabled only with a valid code', async () => {
    await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { token } = await staffLogin(ctx, 'admin@example.com');
    const { secret } = await enrol(token);
    expect((await call(ctx, 'DELETE', '/admin/me/mfa', { token, body: { code: '000000' } })).status).toBe(
      401,
    );
    expect(
      (await call(ctx, 'DELETE', '/admin/me/mfa', { token, body: { code: codeAt(secret, 1) } })).status,
    ).toBe(204);
    expect((await call(ctx, 'GET', '/me', { token })).body.mfaEnabled).toBe(false);
  });
});
