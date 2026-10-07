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

const IOS = { 'x-tk-platform': 'ios' };
const ANDROID = { 'x-tk-platform': 'android' };
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

async function staff(permissions: string[]) {
  await createStaff(ctx, 'staff@example.com', { permissions });
  return (await staffLogin(ctx, 'staff@example.com')).token;
}

describe('static pages (D-038)', () => {
  it('start as drafts nobody sees; publishing is refused until the draft is finished; versions are kept', async () => {
    const token = await staff(['pages:manage']);
    const pages = (await call(ctx, 'GET', '/admin/pages', { token })).body;
    expect(pages.map((p: { slug: string }) => p.slug)).toEqual(['about', 'terms', 'privacy', 'refund']);
    expect(pages[1]).toMatchObject({
      title: { en: 'Terms of use' },
      version: null,
      unpublishedChanges: true,
    });
    expect((await call(ctx, 'GET', '/pages')).body).toEqual([]);
    expect((await call(ctx, 'GET', '/pages/terms')).status).toBe(404);
    expect((await call(ctx, 'GET', '/pages/cookies')).status).toBe(404);

    // The draft still has its DRAFT line and [[placeholders]].
    const draft = (await call(ctx, 'GET', '/admin/pages/terms', { token })).body;
    expect(draft.problems).toEqual([
      'Delete the DRAFT line at the top',
      expect.stringMatching(/^Fill in or remove: \[\[date\]\], \[\[Business name\]\]/),
    ]);
    const refused = await call(ctx, 'POST', '/admin/pages/terms/publish', { token });
    expect(refused.status).toBe(400);

    const save = (text: string) =>
      call(ctx, 'PUT', '/admin/pages/terms', {
        token,
        body: { title: { en: 'Terms of use' }, body: doc(text) },
      });
    expect((await save('Use the app fairly.')).body).toMatchObject({
      problems: [],
      unpublishedChanges: true,
    });
    const v1 = await call(ctx, 'POST', '/admin/pages/terms/publish', { token });
    expect(v1.status).toBe(200);
    expect(v1.body).toMatchObject({
      unpublishedChanges: false,
      versions: [{ version: 1, publishedBy: 'Staff staff@example.com' }],
    });
    expect((await call(ctx, 'POST', '/admin/pages/terms/publish', { token })).status).toBe(409);

    // Readers keep seeing version 1 until the next one is published.
    await save('Use the app fairly. Do not share your account.');
    expect((await call(ctx, 'GET', '/pages/terms')).body).toMatchObject({
      title: { en: 'Terms of use' },
      body: doc('Use the app fairly.'),
      version: 1,
    });
    await call(ctx, 'POST', '/admin/pages/terms/publish', { token });
    expect((await call(ctx, 'GET', '/pages/terms')).body).toMatchObject({ version: 2 });
    expect((await call(ctx, 'GET', '/pages')).body).toEqual([
      { slug: 'terms', title: { en: 'Terms of use' } },
    ]);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'page.publish', entityId: 'terms' } })).toBe(2);

    // A published version cannot be changed or deleted, even directly in the database.
    await expect(
      ctx.prisma.$executeRaw`UPDATE static_page_versions SET title = '{"en":"Changed"}' WHERE slug = 'terms'`,
    ).rejects.toThrow(/cannot be changed or deleted/);
    await expect(
      ctx.prisma.$executeRaw`DELETE FROM static_page_versions WHERE slug = 'terms'`,
    ).rejects.toThrow(/cannot be changed or deleted/);
  });

  it('the refund policy is not shown in the iPhone app (D-027); only page managers edit pages', async () => {
    const token = await staff(['pages:manage']);
    await call(ctx, 'PUT', '/admin/pages/refund', {
      token,
      body: { title: { en: 'Refund policy' }, body: doc('Each request is reviewed by our team.') },
    });
    await call(ctx, 'POST', '/admin/pages/refund/publish', { token });
    expect((await call(ctx, 'GET', '/pages/refund', { headers: ANDROID })).status).toBe(200);
    expect((await call(ctx, 'GET', '/pages/refund')).status).toBe(200);
    expect((await call(ctx, 'GET', '/pages/refund', { headers: IOS })).status).toBe(404);
    expect((await call(ctx, 'GET', '/pages', { headers: IOS })).body).toEqual([]);

    await createStaff(ctx, 'editor@example.com', { permissions: ['courses:edit'] });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/pages', { token: editor })).status).toBe(403);
    const student = (await registerStudent(ctx, 'asha@example.com')).accessToken;
    expect((await call(ctx, 'GET', '/admin/pages', { token: student })).status).toBe(403);
  });
});

describe('Help & support (D-034, D-064)', () => {
  it('FAQs in order, hidden ones and iPhone-hidden ones left out; contact options checked by type', async () => {
    const token = await staff(['support:manage']);
    const faq = (question: string, sortOrder: number, extra: Record<string, unknown> = {}) =>
      call(ctx, 'POST', '/admin/faqs', {
        token,
        body: {
          question: { en: question },
          answer: { en: `About ${question}` },
          sortOrder,
          active: true,
          hideOnIos: false,
          ...extra,
        },
      });
    await faq('How do I reset my password?', 2);
    await faq('Can I study offline?', 1);
    await faq('Old question', 0, { active: false });
    await faq('Where do I buy a course?', 3, { hideOnIos: true });
    const web = (await call(ctx, 'GET', '/faqs')).body.map(
      (f: { question: { en: string } }) => f.question.en,
    );
    expect(web).toEqual(['Can I study offline?', 'How do I reset my password?', 'Where do I buy a course?']);
    const ios = (await call(ctx, 'GET', '/faqs', { headers: IOS })).body.map(
      (f: { question: { en: string } }) => f.question.en,
    );
    expect(ios).toEqual(['Can I study offline?', 'How do I reset my password?']);

    const contact = (type: string, value: string, extra: Record<string, unknown> = {}) =>
      call(ctx, 'POST', '/admin/contact-options', {
        token,
        body: { type, label: { en: type }, value, note: null, sortOrder: 0, active: true, ...extra },
      });
    for (const [type, value] of [
      ['phone', 'call me'],
      ['email', 'not-an-email'],
      ['website', 'http://tayarikakshya.com'],
    ] as const) {
      const bad = await contact(type, value);
      expect(bad.status).toBe(400);
      expect(bad.body.error.details[0].path).toBe('value');
    }
    expect(
      (await contact('whatsapp', '+977 9800000000', { note: { en: 'Sunday–Friday, 10–5' } })).status,
    ).toBe(201);
    expect((await contact('email', 'help@example.com', { sortOrder: 1 })).status).toBe(201);
    const hidden = await contact('phone', '01-4000000', { active: false });
    expect(hidden.status).toBe(201);
    expect((await call(ctx, 'GET', '/contact-options')).body).toEqual([
      expect.objectContaining({
        type: 'whatsapp',
        value: '+977 9800000000',
        note: { en: 'Sunday–Friday, 10–5' },
      }),
      expect.objectContaining({ type: 'email', value: 'help@example.com', note: null }),
    ]);
    expect((await call(ctx, 'DELETE', `/admin/contact-options/${hidden.body.id}`, { token })).status).toBe(
      204,
    );
    expect((await call(ctx, 'GET', '/admin/contact-options', { token })).body).toHaveLength(2);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: { in: ['faq.create', 'contact.create', 'contact.delete'] } },
      }),
    ).toBe(8);

    const student = (await registerStudent(ctx, 'asha@example.com')).accessToken;
    expect((await call(ctx, 'POST', '/admin/faqs', { token: student, body: {} })).status).toBe(403);
    await createStaff(ctx, 'pages@example.com', { permissions: ['pages:manage'] });
    const pagesOnly = (await staffLogin(ctx, 'pages@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/faqs', { token: pagesOnly })).status).toBe(403);
  });
});
