import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pdfFixture, pngFixture } from './fixtures.js';
import { call, createStaff, createTestApp, staffLogin, upload, type TestContext } from './helpers.js';

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

async function editor(permissions = ['media:manage']) {
  await createStaff(ctx, 'media@example.com', { permissions });
  return (await staffLogin(ctx, 'media@example.com')).token;
}

describe('media library', () => {
  it('re-encodes images to WebP renditions, strips metadata and serves them publicly', async () => {
    const token = await editor();
    const res = await upload(
      ctx,
      token,
      { name: 'banner.png', contentType: 'image/png', data: await pngFixture() },
      {
        visibility: 'public',
        altEn: 'Blue banner',
      },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: 'image',
      mimeType: 'image/webp',
      width: 1600,
      height: 900,
      altText: { en: 'Blue banner' },
    });
    expect(Object.keys(res.body.variants)).toEqual(['w320', 'w640', 'w1280']);

    const path = new URL(res.body.url).pathname.replace('/api/v1', '');
    const served = await ctx.app.inject({ method: 'GET', url: `/api/v1${path}` });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');
    expect(served.rawPayload.includes(Buffer.from('secret-exif-marker'))).toBe(false);
  });

  it('stores PDFs privately with a page count and only hands out signed URLs', async () => {
    const token = await editor();
    const res = await upload(
      ctx,
      token,
      { name: 'notes.pdf', contentType: 'application/pdf', data: await pdfFixture(6) },
      {
        visibility: 'public',
      },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'pdf', visibility: 'private', pageCount: 6 });
    expect(res.body.url).toContain('X-Amz-Signature=');
    const fetched = await fetch(res.body.url);
    expect(fetched.status).toBe(200);
    expect((await fetched.arrayBuffer()).byteLength).toBe(res.body.sizeBytes);
  });

  it('detects the real file type and rejects disguised files', async () => {
    const token = await editor();
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const res = await upload(ctx, token, { name: 'photo.png', contentType: 'image/png', data: html });
    expect(res.status).toBe(415);
    const fakePdf = Buffer.from('%PDF-1.7\nthis is not really a pdf');
    expect(
      (await upload(ctx, token, { name: 'x.pdf', contentType: 'application/pdf', data: fakePdf })).status,
    ).toBe(422);
  });

  it('de-duplicates identical uploads', async () => {
    const token = await editor();
    const data = await pngFixture(400, 400, '#15803D');
    const a = await upload(ctx, token, { name: 'a.png', contentType: 'image/png', data });
    const b = await upload(ctx, token, { name: 'b.png', contentType: 'image/png', data });
    expect(b.body.id).toBe(a.body.id);
    expect(await ctx.prisma.mediaAsset.count()).toBe(1);
  });

  it('requires media:manage to upload; content editors can browse', async () => {
    await createStaff(ctx, 'writer@example.com', { permissions: ['content:edit'] });
    const { token } = await staffLogin(ctx, 'writer@example.com');
    expect(
      (
        await upload(ctx, token, {
          name: 'a.png',
          contentType: 'image/png',
          data: await pngFixture(100, 100),
        })
      ).status,
    ).toBe(403);
    expect((await call(ctx, 'GET', '/admin/media', { token })).status).toBe(200);
  });

  it('soft-deletes unused files and audits uploads', async () => {
    const token = await editor();
    const res = await upload(ctx, token, {
      name: 'a.png',
      contentType: 'image/png',
      data: await pngFixture(300, 300),
    });
    expect((await call(ctx, 'DELETE', `/admin/media/${res.body.id}`, { token })).status).toBe(204);
    expect((await call(ctx, 'GET', `/admin/media/${res.body.id}`, { token })).status).toBe(404);
    expect(
      await ctx.prisma.auditLog.count({ where: { action: { in: ['media.upload', 'media.delete'] } } }),
    ).toBe(2);
  });

  it('rejects path traversal on the public media proxy', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/public-media/..%2F..%2Fetc%2Fpasswd' });
    expect(res.statusCode).toBe(404);
  });
});
