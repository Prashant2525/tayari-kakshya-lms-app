import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALL_CONTENT_PERMISSIONS, seedPublishedCourse } from './content-helpers.js';
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

const HOUR = 3_600_000;
const IOS = { 'x-tk-platform': 'ios' };
const ANDROID = { 'x-tk-platform': 'android' };

async function setup() {
  await createStaff(ctx, 'marketing@example.com', {
    permissions: [...ALL_CONTENT_PERMISSIONS, 'banners:manage'],
  });
  const token = (await staffLogin(ctx, 'marketing@example.com')).token;
  await seedPublishedCourse(ctx, token);
  const image = await upload(ctx, token, {
    name: 'banner.png',
    contentType: 'image/png',
    data: await pngFixture(1600, 700),
  });
  const banner = (overrides: Record<string, unknown>) => ({
    title: { en: 'Banner' },
    imageMediaId: image.body.id,
    linkType: 'none',
    linkValue: '',
    placement: 'both',
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    active: true,
    hideOnIos: false,
    ...overrides,
  });
  const create = (overrides: Record<string, unknown>) =>
    call(ctx, 'POST', '/admin/banners', { token, body: banner(overrides) });
  const titles = async (placement: string, headers?: Record<string, string>) =>
    (await call(ctx, 'GET', `/banners?placement=${placement}`, headers ? { headers } : {})).body.map(
      (b: { title: { en: string } }) => b.title.en,
    );
  return { token, image: image.body.id as string, create, titles };
}

describe('banners (D-064)', () => {
  it('show where and when they are meant to; on iPhone, none that lead to buying', async () => {
    const s = await setup();
    const now = Date.now();
    for (const [title, extra] of [
      ['Kharidar course', { linkType: 'course', linkValue: 'sainey-likhit', sortOrder: 1 }],
      [
        'Website offer',
        { linkType: 'url', linkValue: 'https://tayarikakshya.com/offer', placement: 'website', sortOrder: 2 },
      ],
      ['Dashain discount', { placement: 'app', hideOnIos: true, sortOrder: 3 }],
      [
        'Join on the web',
        { linkType: 'url', linkValue: 'https://tayarikakshya.com', placement: 'app', sortOrder: 4 },
      ],
      ['Terms', { linkType: 'page', linkValue: 'terms', placement: 'app', sortOrder: 0 }],
      ['Switched off', { active: false }],
      ['Next week', { startsAt: new Date(now + 24 * HOUR).toISOString() }],
      [
        'Last week',
        { startsAt: new Date(now - 48 * HOUR).toISOString(), endsAt: new Date(now - HOUR).toISOString() },
      ],
    ] as const) {
      const res = await s.create({ title: { en: title }, ...extra });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }
    expect(await s.titles('app', ANDROID)).toEqual([
      'Terms',
      'Kharidar course',
      'Dashain discount',
      'Join on the web',
    ]);
    expect(await s.titles('app', IOS)).toEqual(['Terms', 'Kharidar course']);
    expect(await s.titles('website')).toEqual(['Kharidar course', 'Website offer']);

    const [course] = (await call(ctx, 'GET', '/banners?placement=website')).body;
    expect(course).toMatchObject({
      link: { type: 'course', value: 'sainey-likhit' },
      image: {
        url: expect.stringMatching(/^http/),
        variants: expect.objectContaining({ w1280: expect.any(String) }),
      },
    });
    expect((await call(ctx, 'GET', '/banners?placement=everywhere')).status).toBe(400);

    // The picture is in use; a deleted banner frees it.
    expect((await call(ctx, 'DELETE', `/admin/media/${s.image}`, { token: s.token })).status).toBe(409);
    const list = (await call(ctx, 'GET', '/admin/banners', { token: s.token })).body;
    expect(list).toHaveLength(8);
    for (const b of list) {
      expect((await call(ctx, 'DELETE', `/admin/banners/${b.id}`, { token: s.token })).status).toBe(204);
    }
    expect((await call(ctx, 'DELETE', `/admin/media/${s.image}`, { token: s.token })).status).toBe(204);
    expect(await ctx.prisma.auditLog.count({ where: { entityType: 'banner' } })).toBe(16);
  });

  it('links and dates are checked; only banner managers', async () => {
    const s = await setup();
    const path = async (extra: Record<string, unknown>) => {
      const res = await s.create(extra);
      expect(res.status).toBe(400);
      return res.body.error.details[0].path;
    };
    expect(await path({ linkType: 'url', linkValue: 'http://insecure.example' })).toBe('linkValue');
    expect(await path({ linkType: 'course', linkValue: 'no-such-course' })).toBe('linkValue');
    expect(await path({ linkType: 'page', linkValue: 'cookies' })).toBe('linkValue');
    expect(await path({ linkType: 'none', linkValue: 'x' })).toBe('linkValue');
    expect(await path({ startsAt: '2026-10-10T00:00:00.000Z', endsAt: '2026-10-09T00:00:00.000Z' })).toBe(
      'endsAt',
    );
    expect(await path({ imageMediaId: '00000000-0000-7000-8000-000000000000' })).toBe('imageMediaId');

    await createStaff(ctx, 'editor@example.com', { permissions: ['courses:edit'] });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/banners', { token: editor })).status).toBe(403);
    const student = (await registerStudent(ctx, 'asha@example.com')).accessToken;
    expect((await call(ctx, 'GET', '/admin/banners', { token: student })).status).toBe(403);
  });
});
