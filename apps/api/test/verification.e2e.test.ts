import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { AccountDeletionService } from '../src/modules/auth/account-deletion.service.js';
import { pngFixture } from './fixtures.js';
import {
  call,
  createTestApp,
  device,
  lastEmailCode,
  multipart,
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

/** Lets the next OTP be sent immediately (skips the resend cooldown). */
async function expireCooldown(target: string) {
  await ctx.prisma.otpCode.updateMany({
    where: { target },
    data: { createdAt: new Date(Date.now() - 120_000) },
  });
}

describe('email verification', () => {
  it('verifies the email with the code sent at registration', async () => {
    const { accessToken } = await registerStudent(ctx);
    const code = lastEmailCode(ctx, 'asha@example.com');
    const res = await call(ctx, 'POST', '/me/verification/verify', {
      token: accessToken,
      body: { channel: 'email', code },
    });
    expect(res.status).toBe(204);
    expect((await call(ctx, 'GET', '/me', { token: accessToken })).body.emailVerified).toBe(true);
  });

  it('only accepts the newest code, locks after 5 wrong attempts and enforces the resend cooldown', async () => {
    const { accessToken } = await registerStudent(ctx);
    const oldCode = lastEmailCode(ctx, 'asha@example.com');

    const tooSoon = await call(ctx, 'POST', '/me/verification/send', {
      token: accessToken,
      body: { channel: 'email' },
    });
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error.code).toBe('OTP_RESEND_TOO_SOON');

    await expireCooldown('asha@example.com');
    expect(
      (await call(ctx, 'POST', '/me/verification/send', { token: accessToken, body: { channel: 'email' } }))
        .status,
    ).toBe(202);
    const newCode = lastEmailCode(ctx, 'asha@example.com');
    if (oldCode !== newCode) {
      const stale = await call(ctx, 'POST', '/me/verification/verify', {
        token: accessToken,
        body: { channel: 'email', code: oldCode },
      });
      expect(stale.body.error.code).toBe('OTP_INVALID');
    }

    const wrong = newCode === '000000' ? '111111' : '000000';
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await call(ctx, 'POST', '/me/verification/verify', {
        token: accessToken,
        body: { channel: 'email', code: wrong },
      });
      codes.push(r.body.error.code);
    }
    expect(codes.at(-1)).toBe('OTP_TOO_MANY_ATTEMPTS');
    const locked = await call(ctx, 'POST', '/me/verification/verify', {
      token: accessToken,
      body: { channel: 'email', code: newCode },
    });
    expect(locked.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('never stores codes in plain text', async () => {
    await registerStudent(ctx);
    const code = lastEmailCode(ctx, 'asha@example.com');
    const row = await ctx.prisma.otpCode.findFirstOrThrow({ where: { target: 'asha@example.com' } });
    expect(row.codeHash).not.toContain(code);
  });
});

describe('phone verification (D-029 toggle)', () => {
  it('is refused while the phone channel is disabled', async () => {
    const { accessToken } = await registerStudent(ctx);
    const res = await call(ctx, 'POST', '/me/verification/send', {
      token: accessToken,
      body: { channel: 'phone', phone: '+9779812345678' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('VERIFICATION_CHANNEL_DISABLED');
  });

  it('stores the phone only after the code is verified, and keeps phones unique', async () => {
    await setSetting(ctx, 'auth.verification', {
      channels: { email: true, phone: true },
      requiredForLearning: false,
    });
    const a = await registerStudent(ctx, 'a@example.com');
    const send = await call(ctx, 'POST', '/me/verification/send', {
      token: a.accessToken,
      body: { channel: 'phone', phone: '+9779812345678' },
    });
    expect(send.status).toBe(202);
    expect((await call(ctx, 'GET', '/me', { token: a.accessToken })).body.phone).toBeNull();

    const code = ctx.sms.outbox.at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
    const verify = await call(ctx, 'POST', '/me/verification/verify', {
      token: a.accessToken,
      body: { channel: 'phone', code },
    });
    expect(verify.status).toBe(204);
    expect((await call(ctx, 'GET', '/me', { token: a.accessToken })).body).toMatchObject({
      phone: '+9779812345678',
      phoneVerified: true,
    });

    const b = await registerStudent(ctx, 'b@example.com');
    const taken = await call(ctx, 'POST', '/me/verification/send', {
      token: b.accessToken,
      body: { channel: 'phone', phone: '+9779812345678' },
    });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('PHONE_ALREADY_REGISTERED');
  });
});

describe('password reset by OTP (D-030)', () => {
  it('resets the password, verifies the email and signs out every session', async () => {
    const tokens = await registerStudent(ctx);
    await expireCooldown('asha@example.com');
    ctx.mail.outbox.length = 0;

    const forgot = await call(ctx, 'POST', '/auth/password/forgot', { body: { email: 'asha@example.com' } });
    expect(forgot.status).toBe(202);
    const code = lastEmailCode(ctx, 'asha@example.com');

    const reset = await call(ctx, 'POST', '/auth/password/reset', {
      body: { email: 'asha@example.com', code, newPassword: 'my new secure pass' },
    });
    expect(reset.status).toBe(204);
    expect((await call(ctx, 'GET', '/me', { token: tokens.accessToken })).status).toBe(401);

    const oldLogin = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'asha@example.com', password: PASSWORD, device: device() },
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'asha@example.com', password: 'my new secure pass', device: device() },
    });
    expect(newLogin.status).toBe(200);
    expect((await call(ctx, 'GET', '/me', { token: newLogin.body.accessToken })).body.emailVerified).toBe(
      true,
    );

    const replay = await call(ctx, 'POST', '/auth/password/reset', {
      body: { email: 'asha@example.com', code, newPassword: 'another password!' },
    });
    expect(replay.status).toBe(400);
  });

  it('gives the same response for unknown emails and sends nothing', async () => {
    const res = await call(ctx, 'POST', '/auth/password/forgot', { body: { email: 'ghost@example.com' } });
    expect(res.status).toBe(202);
    expect(ctx.mail.outbox).toHaveLength(0);
  });
});

describe('Google sign-in', () => {
  const identity = {
    subject: 'google-sub-1',
    email: 'asha@gmail.com',
    emailVerified: true,
    name: 'Asha Rai',
  };

  it('creates a verified student on first sign-in and reuses it afterwards', async () => {
    ctx.google.tokens.set('valid-google-token', identity);
    const first = await call(ctx, 'POST', '/auth/google', {
      body: { idToken: 'valid-google-token', device: device() },
    });
    expect(first.status).toBe(200);
    const me = await call(ctx, 'GET', '/me', { token: first.body.accessToken });
    expect(me.body).toMatchObject({ email: 'asha@gmail.com', emailVerified: true, hasPassword: false });

    const second = await call(ctx, 'POST', '/auth/google', {
      body: { idToken: 'valid-google-token', device: device() },
    });
    expect(second.status).toBe(200);
    expect(await ctx.prisma.user.count()).toBe(1);
  });

  it('links to an existing email account', async () => {
    await registerStudent(ctx, 'asha@gmail.com');
    ctx.google.tokens.set('valid-google-token', identity);
    const res = await call(ctx, 'POST', '/auth/google', {
      body: { idToken: 'valid-google-token', device: device() },
    });
    expect(res.status).toBe(200);
    expect(await ctx.prisma.user.count()).toBe(1);
    expect(await ctx.prisma.authIdentity.count()).toBe(1);
  });

  it('rejects invalid tokens and unverified Google emails', async () => {
    const bad = await call(ctx, 'POST', '/auth/google', {
      body: { idToken: 'forged-token-123', device: device() },
    });
    expect(bad.status).toBe(401);
    ctx.google.tokens.set('unverified-token', { ...identity, emailVerified: false });
    const unverified = await call(ctx, 'POST', '/auth/google', {
      body: { idToken: 'unverified-token', device: device() },
    });
    expect(unverified.status).toBe(401);
    expect(await ctx.prisma.user.count()).toBe(0);
  });

  it('never links a Google identity to a staff account', async () => {
    await ctx.prisma.user.create({ data: { kind: 'staff', email: 'asha@gmail.com', fullName: 'Staff' } });
    ctx.google.tokens.set('valid-google-token', identity);
    const res = await call(ctx, 'POST', '/auth/google', {
      body: { idToken: 'valid-google-token', device: device() },
    });
    expect(res.status).toBe(401);
    expect(await ctx.prisma.authIdentity.count()).toBe(0);
  });
});

describe('account deletion (D-032)', () => {
  it('schedules deletion after the grace period, signs out other devices and can be cancelled', async () => {
    const phone = await registerStudent(ctx, 'asha@example.com', device('Phone'));
    const tablet = await call(ctx, 'POST', '/auth/login', {
      body: { email: 'asha@example.com', password: PASSWORD, device: device('Tablet') },
    });

    const req = await call(ctx, 'POST', '/me/deletion', { token: phone.accessToken });
    expect(req.status).toBe(202);
    const days = (new Date(req.body.scheduledFor).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect((await call(ctx, 'GET', '/me', { token: tablet.body.accessToken })).status).toBe(401);
    expect((await call(ctx, 'GET', '/me', { token: phone.accessToken })).body.deletionScheduledFor).toBe(
      req.body.scheduledFor,
    );

    expect((await call(ctx, 'DELETE', '/me/deletion', { token: phone.accessToken })).status).toBe(204);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });
    expect(user.status).toBe('active');
  });

  it('erases personal data once the grace period has passed', async () => {
    const tokens = await registerStudent(ctx);
    await call(ctx, 'POST', '/me/deletion', { token: tokens.accessToken });
    const before = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });

    const service = ctx.app.get(AccountDeletionService);
    expect(await service.processDue(new Date())).toBe(0);
    expect(await service.processDue(new Date(Date.now() + 8 * 86_400_000))).toBe(1);

    const after = await ctx.prisma.user.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toMatchObject({
      status: 'deleted',
      email: null,
      phone: null,
      passwordHash: null,
      fullName: 'Deleted user',
    });
    expect(await ctx.prisma.authSession.count({ where: { userId: before.id } })).toBe(0);
    expect(
      await ctx.prisma.auditLog.count({ where: { action: 'account.erased', entityId: before.id } }),
    ).toBe(1);

    // The address can be used for a new account afterwards.
    await registerStudent(ctx, 'asha@example.com');
  });
});

describe('own email and profile photo (D-074)', () => {
  it('changes the email after a code from the new address and tells the old one', async () => {
    const { accessToken: token } = await registerStudent(ctx);
    await registerStudent(ctx, 'taken@example.com', device('Other'));

    const wrong = await call(ctx, 'POST', '/me/email/change', {
      token,
      body: { newEmail: 'asha.rai@example.com', currentPassword: 'not the password' },
    });
    expect(wrong.status).toBe(401);
    const taken = await call(ctx, 'POST', '/me/email/change', {
      token,
      body: { newEmail: 'taken@example.com', currentPassword: PASSWORD },
    });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    const same = await call(ctx, 'POST', '/me/email/change', {
      token,
      body: { newEmail: 'asha@example.com', currentPassword: PASSWORD },
    });
    expect(same.status).toBe(400);
    // Nothing to confirm before a code was asked for.
    expect(
      (await call(ctx, 'POST', '/me/email/confirm', { token, body: { code: '123456' } })).body.error.code,
    ).toBe('OTP_INVALID');

    const req = await call(ctx, 'POST', '/me/email/change', {
      token,
      body: { newEmail: 'asha.rai@example.com', currentPassword: PASSWORD },
    });
    expect(req.status).toBe(202);
    // Until it is confirmed the account keeps its address.
    expect((await call(ctx, 'GET', '/me', { token })).body.email).toBe('asha@example.com');

    const code = lastEmailCode(ctx, 'asha.rai@example.com');
    const confirm = await call(ctx, 'POST', '/me/email/confirm', { token, body: { code } });
    expect(confirm.status).toBe(204);
    const me = (await call(ctx, 'GET', '/me', { token })).body;
    expect(me).toMatchObject({ email: 'asha.rai@example.com', emailVerified: true });
    const notice = ctx.mail.outbox.find(
      (m) => m.to === 'asha@example.com' && m.subject === 'Your email address was changed',
    );
    expect(notice?.text).toContain('as***@example.com');
    expect(
      await ctx.prisma.auditLog.count({ where: { action: 'account.email_changed', entityId: me.id } }),
    ).toBe(1);

    // The new address signs in; the old one no longer does.
    expect(
      (
        await call(ctx, 'POST', '/auth/login', {
          body: { email: 'asha.rai@example.com', password: PASSWORD, device: device() },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(ctx, 'POST', '/auth/login', {
          body: { email: 'asha@example.com', password: PASSWORD, device: device() },
        })
      ).status,
    ).toBe(401);
  });

  it('stores a resized profile photo, replaces and removes it, and erases it with the account', async () => {
    const { accessToken: token } = await registerStudent(ctx);
    const put = (file: { name: string; contentType: string; data: Buffer }) => {
      const { payload, headers } = multipart(file);
      return ctx.app.inject({
        method: 'PUT',
        url: '/api/v1/me/avatar',
        payload,
        headers: { ...headers, authorization: `Bearer ${token}` },
      });
    };
    expect((await call(ctx, 'GET', '/me', { token })).body.avatarUrl).toBeNull();

    const notImage = await put({
      name: 'photo.png',
      contentType: 'image/png',
      data: Buffer.from('<html>not a picture</html>'),
    });
    expect(notImage.statusCode).toBe(415);

    const first = await put({ name: 'me.png', contentType: 'image/png', data: await pngFixture(900, 600) });
    expect(first.statusCode).toBe(200);
    const firstUrl: string = JSON.parse(first.body).avatarUrl;
    expect(firstUrl).toMatch(/avatars\/.+\.webp$/);
    expect((await call(ctx, 'GET', '/me', { token })).body.avatarUrl).toBe(firstUrl);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });
    const storage = ctx.app.get(StorageService);
    const stored = await sharp(await storage.getBuffer('public', user.avatarKey!)).metadata();
    expect(stored).toMatchObject({ format: 'webp', width: 512, height: 512 });

    const second = await put({ name: 'me2.png', contentType: 'image/png', data: await pngFixture(300, 300) });
    const secondKey = (await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).avatarKey!;
    expect(JSON.parse(second.body).avatarUrl).not.toBe(firstUrl);
    await expect(storage.getBuffer('public', user.avatarKey!)).rejects.toThrow();

    expect((await call(ctx, 'DELETE', '/me/avatar', { token })).status).toBe(204);
    expect((await call(ctx, 'GET', '/me', { token })).body.avatarUrl).toBeNull();
    await expect(storage.getBuffer('public', secondKey)).rejects.toThrow();

    // Erasure (D-032) removes the photo too.
    await put({ name: 'me.png', contentType: 'image/png', data: await pngFixture(200, 200) });
    const lastKey = (await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).avatarKey!;
    await call(ctx, 'POST', '/me/deletion', { token });
    await ctx.app.get(AccountDeletionService).processDue(new Date(Date.now() + 8 * 86_400_000));
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).avatarKey).toBeNull();
    await expect(storage.getBuffer('public', lastKey)).rejects.toThrow();
  });
});
