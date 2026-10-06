import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/modules/auth/account-deletion.service.js';
import { ALL_CONTENT_PERMISSIONS, seedPublishedCourse } from './content-helpers.js';
import {
  call,
  createStaff,
  registerStudent,
  setSetting,
  staffLogin,
  type TestContext,
  createTestApp,
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

const DAY = 86_400_000;

/** Template wording is test input; real wording is written by staff in the CMS. */
const templateBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Course completion',
  language: 'en',
  requiredPercent: 50,
  title: { en: 'Certificate of Completion', ne: 'प्रमाणपत्र' },
  intro: { en: 'This is to certify that' },
  statement: { en: 'has completed the course' },
  issuerName: { en: 'Test Academy' },
  signatories: [{ name: { en: 'Sita Karki' }, role: { en: 'Director' } }],
  active: true,
  ...overrides,
});

async function setup() {
  await createStaff(ctx, 'certs@example.com', {
    permissions: [...ALL_CONTENT_PERMISSIONS, 'certificates:manage'],
  });
  const admin = (await staffLogin(ctx, 'certs@example.com')).token;
  const seeded = await seedPublishedCourse(ctx, admin);
  const template = await call(ctx, 'POST', '/admin/certificate-templates', {
    token: admin,
    body: templateBody(),
  });
  expect(template.status).toBe(201);
  const assign = (templateId: string | null) =>
    call(ctx, 'PUT', `/admin/courses/${seeded.course.id}/certificate`, {
      token: admin,
      body: { templateId },
    });
  const student = async (email: string) => {
    const tokens = await registerStudent(ctx, email);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    return { token: tokens.accessToken, userId: user.id };
  };
  const grant = async (userId: string) => {
    const res = await call(ctx, 'POST', `/admin/users/${userId}/entitlements`, {
      token: admin,
      body: { courseId: seeded.course.id, endsAt: null },
    });
    expect(res.status).toBe(201);
  };
  const finish = (token: string, itemId: string) =>
    call(ctx, 'PUT', `/learning-items/${itemId}/progress`, { token, body: { completed: true } });
  return { admin, seeded, templateId: template.body.id as string, assign, student, grant, finish };
}

describe('certificates for finishing a course (D-049, D-050)', () => {
  it('issues automatically at the template share of lessons and freezes what it says', async () => {
    const s = await setup();
    expect((await s.assign(s.templateId)).status).toBe(200);
    const asha = await s.student('asha@example.com');
    await s.grant(asha.userId);

    // 4 lessons, 50 % → the second finished lesson earns it.
    const first = await s.finish(asha.token, s.seeded.freeNote.id);
    expect(first.body.newCertificates).toEqual([]);
    let detail = await call(ctx, 'GET', `/courses/sainey-likhit`, { token: asha.token });
    expect(detail.body.access.certificate).toEqual({
      requiredPercent: 50,
      progress: { completed: 1, total: 4 },
      earned: null,
    });
    const second = await s.finish(asha.token, s.seeded.premiumNote.id);
    expect(second.body.newCertificates).toHaveLength(1);
    expect(second.body.newCertificates[0]).toMatchObject({ course: { id: s.seeded.course.id } });
    // Finishing again, or more lessons, never issues a second one.
    expect((await s.finish(asha.token, s.seeded.premiumNote.id)).body.newCertificates).toEqual([]);
    expect((await s.finish(asha.token, s.seeded.freeVideo.id)).body.newCertificates).toEqual([]);
    expect(await ctx.prisma.certificate.count()).toBe(1);

    const mine = await call(ctx, 'GET', '/me/certificates', { token: asha.token });
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    const code = mine.body[0].code as string;
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(mine.body[0]).toMatchObject({
      course: { id: s.seeded.course.id, slug: 'sainey-likhit' },
      revoked: false,
    });
    detail = await call(ctx, 'GET', `/courses/sainey-likhit`, { token: asha.token });
    expect(detail.body.access.certificate.earned).toEqual({ id: mine.body[0].id, code, revoked: false });

    // Public verification, however the number is typed.
    const verify = await call(ctx, 'GET', `/certificates/${code.toLowerCase()}`);
    expect(verify.status).toBe(200);
    expect(verify.body).toMatchObject({
      code,
      status: 'valid',
      holderName: 'Asha Rai',
      courseTitle: { en: 'Sainey Likhit' },
      issuerName: { en: 'Test Academy' },
      revokedAt: null,
    });
    // Later edits to the template or the student's name do not change an issued certificate.
    await call(ctx, 'PUT', `/admin/certificate-templates/${s.templateId}`, {
      token: s.admin,
      body: templateBody({ issuerName: { en: 'Renamed Academy' } }),
    });
    await ctx.prisma.user.update({ where: { id: asha.userId }, data: { fullName: 'Asha Changed' } });
    expect((await call(ctx, 'GET', `/certificates/${code}`)).body).toMatchObject({
      holderName: 'Asha Rai',
      issuerName: { en: 'Test Academy' },
    });

    const pdf = await call(ctx, 'GET', `/certificates/${code.replaceAll('-', '')}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(String(pdf.body).startsWith('%PDF-')).toBe(true);

    expect((await call(ctx, 'GET', '/certificates/0000-0000-0000')).status).toBe(404);
    expect((await call(ctx, 'GET', '/certificates/not-a-code')).status).toBe(404);
    expect((await call(ctx, 'GET', '/certificates/not-a-code/pdf')).status).toBe(404);
  });

  it('needs access to the course, an active template and a non-empty course; qualifying earlier counts later', async () => {
    const s = await setup();
    await s.assign(s.templateId);
    const bina = await s.student('bina@example.com');
    // Free lessons can be finished without access, but the certificate needs the course (My courses).
    await s.finish(bina.token, s.seeded.freeNote.id);
    expect((await s.finish(bina.token, s.seeded.freeVideo.id)).body.newCertificates).toEqual([]);
    expect((await call(ctx, 'GET', '/me/certificates', { token: bina.token })).body).toEqual([]);
    const open = await call(ctx, 'GET', '/courses/sainey-likhit', { token: bina.token });
    expect(open.body.access.certificate).toEqual({
      requiredPercent: 50,
      progress: { completed: 2, total: 4 },
      earned: null,
    });

    // Inactive template: nothing is issued and the course shows no certificate.
    await call(ctx, 'PUT', `/admin/certificate-templates/${s.templateId}`, {
      token: s.admin,
      body: templateBody({ active: false }),
    });
    await s.grant(bina.userId);
    expect((await call(ctx, 'GET', '/me/certificates', { token: bina.token })).body).toEqual([]);
    let detail = await call(ctx, 'GET', `/courses/sainey-likhit`, { token: bina.token });
    expect(detail.body.access.certificate).toBeNull();

    // Active again: the lessons she finished before already qualify, so opening the course issues it.
    await call(ctx, 'PUT', `/admin/certificate-templates/${s.templateId}`, {
      token: s.admin,
      body: templateBody(),
    });
    detail = await call(ctx, 'GET', `/courses/sainey-likhit`, { token: bina.token });
    expect(detail.body.access.certificate.earned).toMatchObject({ revoked: false });
    expect(await ctx.prisma.certificate.count({ where: { userId: bina.userId } })).toBe(1);

    // A course without a template shows nothing.
    const chet = await s.student('chet@example.com');
    await s.assign(null);
    await s.grant(chet.userId);
    detail = await call(ctx, 'GET', `/courses/sainey-likhit`, { token: chet.token });
    expect(detail.body.access.certificate).toBeNull();
  });

  it('revokes and reinstates (audited); a revoked certificate no longer verifies as valid nor serves its PDF', async () => {
    const s = await setup();
    await s.assign(s.templateId);
    const asha = await s.student('asha@example.com');
    await s.grant(asha.userId);
    await s.finish(asha.token, s.seeded.freeNote.id);
    await s.finish(asha.token, s.seeded.freeVideo.id);
    const [cert] = (await call(ctx, 'GET', '/me/certificates', { token: asha.token })).body;

    const list = await call(ctx, 'GET', `/admin/certificates?q=${cert.code}`, { token: s.admin });
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id: cert.id, holderName: 'Asha Rai', revoked: null });
    expect((await call(ctx, 'GET', '/admin/certificates?q=asha', { token: s.admin })).body.data).toHaveLength(
      1,
    );
    expect(
      (await call(ctx, 'GET', '/admin/certificates?q=nobody', { token: s.admin })).body.data,
    ).toHaveLength(0);

    expect(
      (
        await call(ctx, 'POST', `/admin/certificates/${cert.id}/revoke`, {
          token: s.admin,
          body: { reason: 'x' },
        })
      ).status,
    ).toBe(400);
    const revoke = await call(ctx, 'POST', `/admin/certificates/${cert.id}/revoke`, {
      token: s.admin,
      body: { reason: 'Issued by mistake' },
    });
    expect(revoke.status).toBe(204);
    expect(
      (
        await call(ctx, 'POST', `/admin/certificates/${cert.id}/revoke`, {
          token: s.admin,
          body: { reason: 'Again' },
        })
      ).status,
    ).toBe(409);
    expect((await call(ctx, 'GET', `/certificates/${cert.code}`)).body).toMatchObject({ status: 'revoked' });
    const pdf = await call(ctx, 'GET', `/certificates/${cert.code}/pdf`);
    expect(pdf.status).toBe(410);
    expect(pdf.body.error.code).toBe('CERTIFICATE_REVOKED');
    expect((await call(ctx, 'GET', '/me/certificates', { token: asha.token })).body[0].revoked).toBe(true);
    // Revoked stays revoked: it is not issued again.
    expect((await s.finish(asha.token, s.seeded.premiumNote.id)).body.newCertificates).toEqual([]);
    const revokedList = await call(ctx, 'GET', '/admin/certificates?status=revoked', { token: s.admin });
    expect(revokedList.body.data[0].revoked).toMatchObject({
      reason: 'Issued by mistake',
      by: 'Staff certs@example.com',
    });

    expect(
      (await call(ctx, 'POST', `/admin/certificates/${cert.id}/reinstate`, { token: s.admin })).status,
    ).toBe(204);
    expect((await call(ctx, 'GET', `/certificates/${cert.code}`)).body).toMatchObject({ status: 'valid' });
    expect((await call(ctx, 'GET', `/certificates/${cert.code}/pdf`)).status).toBe(200);
    expect(
      (await call(ctx, 'POST', `/admin/certificates/${cert.id}/reinstate`, { token: s.admin })).status,
    ).toBe(409);

    const audit = await ctx.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: { in: ['certificate', 'certificate_template'] } },
          { action: 'course.certificate' },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(audit.map((a) => a.action)).toEqual([
      'certificate_template.create',
      'course.certificate',
      'certificate.revoke',
      'certificate.reinstate',
    ]);
  });

  it('validates templates, enforces permissions and staff scopes, previews, and erases with the account', async () => {
    const s = await setup();
    await s.assign(s.templateId);
    for (const bad of [
      templateBody({ requiredPercent: 0 }),
      templateBody({ requiredPercent: 101 }),
      templateBody({ title: {} }),
      templateBody({
        signatories: Array.from({ length: 4 }, () => ({ name: { en: 'A' }, role: { en: 'B' } })),
      }),
    ]) {
      expect(
        (await call(ctx, 'POST', '/admin/certificate-templates', { token: s.admin, body: bad })).status,
      ).toBe(400);
    }
    const preview = await call(ctx, 'GET', `/admin/certificate-templates/${s.templateId}/preview`, {
      token: s.admin,
    });
    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toBe('application/pdf');
    const detail = await call(ctx, 'GET', `/admin/certificate-templates/${s.templateId}`, { token: s.admin });
    expect(detail.body).toMatchObject({ requiredPercent: 50, courses: [{ id: s.seeded.course.id }] });
    expect(
      (await call(ctx, 'GET', `/admin/courses/${s.seeded.course.id}`, { token: s.admin })).body,
    ).toMatchObject({
      certificateTemplateId: s.templateId,
    });

    // A course editor can pick a template but not write templates or see issued certificates.
    await createStaff(ctx, 'editor@example.com', { permissions: ['courses:edit'] });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/certificate-templates', { token: editor })).status).toBe(200);
    expect(
      (await call(ctx, 'POST', '/admin/certificate-templates', { token: editor, body: templateBody() }))
        .status,
    ).toBe(403);
    expect((await call(ctx, 'GET', '/admin/certificates', { token: editor })).status).toBe(403);
    expect(
      (
        await call(ctx, 'PUT', `/admin/courses/${s.seeded.course.id}/certificate`, {
          token: editor,
          body: { templateId: s.templateId },
        })
      ).status,
    ).toBe(200);

    const asha = await s.student('asha@example.com');
    await s.grant(asha.userId);
    await s.finish(asha.token, s.seeded.freeNote.id);
    await s.finish(asha.token, s.seeded.freeVideo.id);
    const [cert] = (await call(ctx, 'GET', '/me/certificates', { token: asha.token })).body;
    expect((await call(ctx, 'GET', '/admin/certificates', { token: asha.token })).status).toBe(403);
    expect((await call(ctx, 'GET', '/me/certificates', { token: s.admin })).status).toBe(403);
    expect((await call(ctx, 'GET', '/me/certificates')).status).toBe(401);

    // Scoped to another course: neither listed nor revocable, and cannot assign this course's template.
    await createStaff(ctx, 'scoped@example.com', { permissions: ['certificates:manage', 'courses:edit'] });
    const scopedUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'scoped@example.com' } });
    const other = await ctx.prisma.course.create({ data: { slug: 'other', title: { en: 'Other' } } });
    await ctx.prisma.staffScope.create({
      data: { userId: scopedUser.id, scopeType: 'course', scopeId: other.id },
    });
    const scoped = (await staffLogin(ctx, 'scoped@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/certificates', { token: scoped })).body.data).toEqual([]);
    expect(
      (
        await call(ctx, 'POST', `/admin/certificates/${cert.id}/revoke`, {
          token: scoped,
          body: { reason: 'Nope' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(ctx, 'PUT', `/admin/courses/${s.seeded.course.id}/certificate`, {
          token: scoped,
          body: { templateId: null },
        })
      ).status,
    ).toBe(403);

    // The verification link setting only accepts https without a trailing slash.
    const settings = await call(ctx, 'PUT', '/admin/settings/certificates.verification', {
      token: await settingsEditor(),
      body: { value: { baseUrl: 'https://example.com/certificates/' } },
    });
    expect(settings.status).toBe(400);
    await setSetting(ctx, 'certificates.verification', { baseUrl: 'https://example.com/certificates' });
    expect((await call(ctx, 'GET', `/certificates/${cert.code}/pdf`)).status).toBe(200);

    // Erasure removes the student's certificates.
    await call(ctx, 'POST', '/me/deletion', { token: asha.token });
    await ctx.app.get(AccountDeletionService).processDue(new Date(Date.now() + 60 * DAY));
    expect(await ctx.prisma.certificate.count()).toBe(0);
    expect((await call(ctx, 'GET', `/certificates/${cert.code}`)).status).toBe(404);
  });
});

async function settingsEditor() {
  await createStaff(ctx, 'settings@example.com', { permissions: ['settings:update'] });
  return (await staffLogin(ctx, 'settings@example.com')).token;
}
