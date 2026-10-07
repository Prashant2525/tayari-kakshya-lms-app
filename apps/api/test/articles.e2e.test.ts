import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ArticlesService } from '../src/modules/articles/articles.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
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

const doc = (text: string, extra: unknown[] = []) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...extra] },
});
const article = (overrides: Record<string, unknown> = {}) => ({
  kind: 'news',
  slug: 'psc-calendar-2083',
  title: { en: 'PSC publishes its 2083 calendar', ne: 'लोक सेवा आयोगको २०८३ को क्यालेन्डर' },
  summary: null,
  body: doc('The Public Service Commission has published next year’s exam calendar with 120 posts.'),
  coverMediaId: null,
  categoryId: null,
  period: null,
  periodDate: null,
  sourceName: null,
  sourceUrl: null,
  quizAssessmentId: null,
  isFeatured: false,
  notify: false,
  ...overrides,
});

async function staff() {
  await createStaff(ctx, 'writer@example.com', { permissions: ['articles:edit'] });
  await createStaff(ctx, 'publisher@example.com', {
    permissions: ['articles:edit', 'articles:publish', 'media:manage', 'notices:edit'],
  });
  return {
    writer: (await staffLogin(ctx, 'writer@example.com')).token,
    publisher: (await staffLogin(ctx, 'publisher@example.com')).token,
  };
}

async function publish(token: string, body: Record<string, unknown>) {
  const created = await call(ctx, 'POST', '/admin/articles', { token, body });
  if (created.status !== 201) throw new Error(JSON.stringify(created.body));
  const status = await call(ctx, 'PUT', `/admin/articles/${created.body.id}/status`, {
    token,
    body: { status: 'published' },
  });
  if (status.status !== 200) throw new Error(JSON.stringify(status.body));
  return created.body.id as string;
}

const paths = (res: { body: { error: { details: Array<{ path: string }> } } }) =>
  res.body.error.details.map((d) => d.path);

describe('articles in the CMS (D-063)', () => {
  it('writers draft; only publishers publish or change live ones; rules per kind; one address each', async () => {
    const { writer, publisher } = await staff();
    const create = (body: unknown, token = writer) => call(ctx, 'POST', '/admin/articles', { token, body });

    // Current affairs need a period and the date covered; Gorkhapatra summaries the issue date and source link.
    const ca = await create(article({ kind: 'current_affairs', slug: 'week-1' }));
    expect(ca.status).toBe(400);
    expect(paths(ca)).toEqual(expect.arrayContaining(['period', 'periodDate']));
    const gp = await create(article({ kind: 'gorkhapatra', slug: 'gp-1' }));
    expect(paths(gp)).toEqual(expect.arrayContaining(['periodDate', 'sourceUrl']));
    expect(
      paths(
        await create(
          article({ kind: 'gorkhapatra', slug: 'gp-1', periodDate: '2026-10-07', sourceUrl: 'http://x.np' }),
        ),
      ),
    ).toEqual(['sourceUrl']);
    expect(paths(await create(article({ period: 'daily' })))).toEqual(['period']);
    expect(paths(await create(article({ slug: 'Not A Slug' })))).toEqual(['slug']);

    const draft = await create(article());
    expect(draft.status).toBe(201);
    const again = await create(article());
    expect(again.status).toBe(400);
    expect(paths(again)).toEqual(['slug']);

    const id = draft.body.id as string;
    expect(
      (
        await call(ctx, 'PUT', `/admin/articles/${id}/status`, {
          token: writer,
          body: { status: 'published' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(ctx, 'PUT', `/admin/articles/${id}/status`, {
          token: publisher,
          body: { status: 'published' },
        })
      ).status,
    ).toBe(200);
    expect((await call(ctx, 'PUT', `/admin/articles/${id}`, { token: writer, body: article() })).status).toBe(
      403,
    );
    expect(
      (
        await call(ctx, 'PUT', `/admin/articles/${id}`, {
          token: publisher,
          body: article({ title: { en: 'PSC calendar out' } }),
        })
      ).status,
    ).toBe(200);

    // A category must be of the article's kind.
    const cat = await call(ctx, 'POST', '/admin/article-categories', {
      token: publisher,
      body: { kind: 'current_affairs', name: { en: 'Economy' }, sortOrder: 1, active: true },
    });
    expect(cat.status).toBe(201);
    expect(
      (
        await call(ctx, 'POST', '/admin/article-categories', {
          token: writer,
          body: { kind: 'news', name: { en: 'X' }, sortOrder: 1, active: true },
        })
      ).status,
    ).toBe(403);
    expect(paths(await create(article({ slug: 'with-cat', categoryId: cat.body.id })))).toEqual([
      'categoryId',
    ]);

    // Deleting frees the address.
    expect((await call(ctx, 'DELETE', `/admin/articles/${id}`, { token: writer })).status).toBe(403);
    expect((await call(ctx, 'DELETE', `/admin/articles/${id}`, { token: publisher })).status).toBe(204);
    expect((await create(article())).status).toBe(201);
    expect(
      await ctx.prisma.auditLog.count({
        where: { entityType: 'article', action: { startsWith: 'article.' } },
      }),
    ).toBeGreaterThanOrEqual(5);
  });
});

describe('reading articles (D-063)', () => {
  it('anyone reads live articles by kind, period and category; drafts, future and deleted ones stay hidden', async () => {
    const { publisher } = await staff();
    const economy = (
      await call(ctx, 'POST', '/admin/article-categories', {
        token: publisher,
        body: {
          kind: 'current_affairs',
          name: { en: 'Economy', ne: 'अर्थतन्त्र' },
          sortOrder: 1,
          active: true,
        },
      })
    ).body.id as string;
    await call(ctx, 'POST', '/admin/article-categories', {
      token: publisher,
      body: { kind: 'current_affairs', name: { en: 'Old' }, sortOrder: 2, active: false },
    });
    await publish(publisher, article());
    await publish(
      publisher,
      article({
        kind: 'current_affairs',
        slug: 'weekly-asoj-3',
        title: { en: 'This week: budget review' },
        summary: { en: 'Budget, monsoon and SAARC.' },
        period: 'weekly',
        periodDate: '2026-10-04',
        categoryId: economy,
        isFeatured: true,
      }),
    );
    await publish(
      publisher,
      article({
        kind: 'gorkhapatra',
        slug: 'gorkhapatra-2083-06-21',
        title: { en: 'Gorkhapatra: 21 Asoj' },
        periodDate: '2026-10-07',
        sourceName: 'Gorkhapatra',
        sourceUrl: 'https://gorkhapatraonline.com/epaper',
      }),
    );
    // Not shown: a draft, one scheduled for tomorrow, a deleted one.
    await call(ctx, 'POST', '/admin/articles', { token: publisher, body: article({ slug: 'draft-one' }) });
    const later = await call(ctx, 'POST', '/admin/articles', {
      token: publisher,
      body: article({ slug: 'later' }),
    });
    await call(ctx, 'PUT', `/admin/articles/${later.body.id}/status`, {
      token: publisher,
      body: { status: 'scheduled', publishAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    const gone = await publish(publisher, article({ slug: 'gone' }));
    await call(ctx, 'DELETE', `/admin/articles/${gone}`, { token: publisher });

    // Signed out (the website) and signed in see the same.
    const all = await call(ctx, 'GET', '/articles');
    expect(all.status).toBe(200);
    expect(all.body.data.map((a: { slug: string }) => a.slug).sort()).toEqual(
      ['gorkhapatra-2083-06-21', 'psc-calendar-2083', 'weekly-asoj-3'].sort(),
    );
    const weekly = await call(
      ctx,
      'GET',
      `/articles?kind=current_affairs&period=weekly&categoryId=${economy}`,
    );
    expect(weekly.body.data).toEqual([
      expect.objectContaining({
        slug: 'weekly-asoj-3',
        summary: { en: 'Budget, monsoon and SAARC.' },
        period: 'weekly',
        periodDate: '2026-10-04',
        isFeatured: true,
        category: { id: economy, name: { en: 'Economy', ne: 'अर्थतन्त्र' } },
      }),
    ]);
    expect((await call(ctx, 'GET', '/articles?featured=true')).body.data).toHaveLength(1);
    expect((await call(ctx, 'GET', '/articles?kind=blog')).body.data).toEqual([]);

    const news = await call(ctx, 'GET', '/articles/psc-calendar-2083');
    expect(news.body).toMatchObject({
      kind: 'news',
      title: { en: 'PSC publishes its 2083 calendar' },
      // No written summary: the start of the text.
      summary: { en: expect.stringContaining('The Public Service Commission has published') },
      body: article().body,
      quiz: null,
    });
    expect((await call(ctx, 'GET', '/articles/gorkhapatra-2083-06-21')).body).toMatchObject({
      sourceName: 'Gorkhapatra',
      sourceUrl: 'https://gorkhapatraonline.com/epaper',
      periodDate: '2026-10-07',
    });
    for (const slug of ['draft-one', 'later', 'gone']) {
      expect((await call(ctx, 'GET', `/articles/${slug}`)).status).toBe(404);
    }
    const asha = (await registerStudent(ctx, 'asha@example.com')).accessToken;
    expect((await call(ctx, 'GET', '/articles?limit=50', { token: asha })).body.data).toHaveLength(3);
    // Unified search finds live articles only (the draft, scheduled and deleted ones share this title).
    const found = (await call(ctx, 'GET', '/search?q=calendar', { token: asha })).body;
    expect(found.articles).toEqual([
      expect.objectContaining({ kind: 'news', slug: 'psc-calendar-2083', title: article().title }),
    ]);
    expect(
      (await call(ctx, 'GET', `/search?q=${encodeURIComponent('बजेट')}`, { token: asha })).body.articles,
    ).toEqual([]);
    expect((await call(ctx, 'GET', '/search?q=budget', { token: asha })).body.articles).toEqual([
      expect.objectContaining({ slug: 'weekly-asoj-3', period: 'weekly', periodDate: '2026-10-04' }),
    ]);
    // Only active categories are offered.
    expect((await call(ctx, 'GET', '/article-categories?kind=current_affairs')).body).toEqual([
      { id: economy, kind: 'current_affairs', name: { en: 'Economy', ne: 'अर्थतन्त्र' } },
    ]);
  });

  it('an article with "notify" reaches every student once, as each chose; its images cannot be deleted', async () => {
    const { publisher } = await staff();
    const asha = await registerStudent(ctx, 'asha@example.com');
    const bina = await registerStudent(ctx, 'bina@example.com');
    const prefs = await call(ctx, 'GET', '/me/notification-preferences', { token: bina.accessToken });
    expect(prefs.body.article).toEqual({ push: true, email: true });
    await call(ctx, 'PUT', '/me/notification-preferences', {
      token: bina.accessToken,
      body: { ...prefs.body, article: { push: false, email: false } },
    });

    const image = await upload(ctx, publisher, {
      name: 'cover.png',
      contentType: 'image/png',
      data: await pngFixture(400, 300),
    });
    const inline = await upload(ctx, publisher, {
      name: 'chart.png',
      contentType: 'image/png',
      data: await pngFixture(300, 200, '#15803D'),
    });
    await publish(
      publisher,
      article({
        slug: 'with-images',
        coverMediaId: image.body.id,
        body: doc('Results are out.', [{ type: 'image', attrs: { mediaId: inline.body.id } }]),
        notify: true,
      }),
    );
    const detail = (await call(ctx, 'GET', '/articles/with-images')).body;
    expect(detail.cover.url).toMatch(/^http/);
    expect(Object.keys(detail.media)).toEqual(expect.arrayContaining([inline.body.id]));

    const articles = ctx.app.get(ArticlesService);
    expect(await articles.dispatchDue()).toBe(1);
    expect(await articles.dispatchDue()).toBe(0);
    const inbox = (await call(ctx, 'GET', '/me/notifications', { token: asha.accessToken })).body.data;
    expect(inbox).toEqual([
      expect.objectContaining({
        category: 'article',
        title: article().title,
        link: { type: 'article', slug: 'with-images' },
      }),
    ]);
    const deliveries = await ctx.prisma.notificationDelivery.findMany({
      select: { channel: true, userId: true },
    });
    const ashaId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } })).id;
    expect(deliveries.every((d) => d.userId === ashaId)).toBe(true);
    expect(deliveries.map((d) => d.channel).sort()).toEqual(['email', 'push']);
    await ctx.app.get(NotificationsService).processDeliveries();
    expect(
      ctx.mail.outbox.find((m) => m.to === 'asha@example.com' && m.subject === article().title.en),
    ).toBeTruthy();

    // The cover and the picture in the text are in use; so is a picture in a notice (T-055 gap).
    for (const id of [image.body.id, inline.body.id]) {
      expect((await call(ctx, 'DELETE', `/admin/media/${id}`, { token: publisher })).status).toBe(409);
    }
    const inNotice = await upload(ctx, publisher, {
      name: 'notice.png',
      contentType: 'image/png',
      data: await pngFixture(200, 200, '#B42318'),
    });
    await call(ctx, 'POST', '/admin/notices', {
      token: publisher,
      body: {
        kind: 'announcement',
        title: { en: 'Results' },
        body: doc('See the chart.', [{ type: 'image', attrs: { mediaId: inNotice.body.id } }]),
        isPinned: false,
        expiresAt: null,
        notify: false,
      },
    });
    expect((await call(ctx, 'DELETE', `/admin/media/${inNotice.body.id}`, { token: publisher })).status).toBe(
      409,
    );
  });
});
