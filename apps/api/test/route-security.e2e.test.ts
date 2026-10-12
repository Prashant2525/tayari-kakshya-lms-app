import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AUDIENCES,
  IS_PUBLIC,
  PERMISSIONS_ANY,
  PERMISSIONS_REQUIRED,
} from '../src/common/auth/auth-context.js';
import { createTestApp, type TestContext } from './helpers.js';

interface RouteInfo {
  route: string;
  isPublic: boolean;
  audiences: string[] | undefined;
  permissions: string[];
}

function inventory(ctx: TestContext): RouteInfo[] {
  const out: RouteInfo[] = [];
  for (const module of ctx.app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const cls = wrapper.metatype as (new (...args: never[]) => unknown) | null;
      if (!cls) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, cls) ?? '');
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const handler = (cls.prototype as Record<string, unknown>)[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (path === undefined || method === undefined) continue;
        const meta = <T>(key: string) =>
          (Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, cls)) as T | undefined;
        const route = `${RequestMethod[method]} /${[base, path].filter((p) => p && p !== '/').join('/')}`
          .replace(/\/+/g, '/')
          .replace(/\/$/, '');
        out.push({
          route,
          isPublic: Boolean(meta<boolean>(IS_PUBLIC)),
          audiences: meta<string[]>(AUDIENCES),
          permissions: [
            ...(meta<string[]>(PERMISSIONS_REQUIRED) ?? []),
            ...(meta<string[]>(PERMISSIONS_ANY) ?? []),
          ],
        });
      }
    }
  }
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * Routes reachable without an access token. Adding one is a security decision: update this list in the same change
 * (and say why in the PR).
 */
const PUBLIC_ROUTES = [
  'GET /app/config',
  'GET /article-categories',
  'GET /articles',
  'GET /articles/:slug',
  'GET /banners',
  // Anyone holding a certificate number may check it (64-bit random codes, rate limited).
  'GET /certificates/:code',
  'GET /certificates/:code/pdf',
  'GET /contact-options',
  'GET /courses',
  'GET /courses/:slug',
  'GET /courses/:slug/reviews',
  'GET /education-levels',
  'GET /exam-node-types',
  'GET /exam-nodes',
  'GET /faqs',
  'GET /health/live',
  'GET /health/ready',
  'GET /pages',
  'GET /pages/:slug',
  // Gateway pages and returns: the browser arrives without the student's token; signed or verified with the gateway.
  'GET /payments/esewa/:paymentId/start',
  'GET /payments/esewa/return',
  'GET /payments/khalti/return',
  'GET /plans',
  'GET /public-media/*',
  // HMAC-signed, expiring link.
  'GET /receipts/:id/pdf',
  // The PDF reader page and its scripts; the PDF itself needs the student's token.
  'GET /viewer/assets/:dir/:file',
  'GET /viewer/assets/:file',
  'GET /viewer/pdf',
  'GET /viewer/pdf-offline',
  'POST /admin/auth/login',
  'POST /admin/auth/login/mfa',
  'POST /admin/auth/refresh',
  'POST /auth/google',
  'POST /auth/login',
  'POST /auth/password/forgot',
  'POST /auth/password/reset',
  'POST /auth/refresh',
  'POST /auth/register',
];

/** Signed-in routes open to both students and staff: their own account. */
const SHARED_ROUTES = [
  'DELETE /me/sessions/:id',
  'GET /me',
  'GET /me/sessions',
  'PATCH /me',
  'POST /me/password',
];

/** Staff routes that need no permission: the staff member's own sign-out and two-factor set-up. */
const STAFF_SELF_ROUTES = [
  'DELETE /admin/me/mfa',
  'GET /admin/me/mfa',
  'POST /admin/auth/logout',
  'POST /admin/me/mfa/enable',
  'POST /admin/me/mfa/setup',
];

describe('route security (Phase 15)', () => {
  let ctx: TestContext;
  let routes: RouteInfo[];
  beforeAll(async () => {
    ctx = await createTestApp();
    routes = inventory(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(300);
  });

  it('only the listed routes are public', () => {
    expect(routes.filter((r) => r.isPublic).map((r) => r.route)).toEqual(PUBLIC_ROUTES);
  });

  it('every /admin route is for staff tokens only, and needs a permission unless it is the staff member’s own', () => {
    const admin = routes.filter((r) => r.route.split(' ')[1]!.startsWith('/admin') && !r.isPublic);
    expect(admin.filter((r) => r.audiences?.join() !== 'staff').map((r) => r.route)).toEqual([]);
    expect(admin.filter((r) => r.permissions.length === 0).map((r) => r.route)).toEqual(STAFF_SELF_ROUTES);
  });

  it('every other signed-in route is for students, except the shared account routes', () => {
    const rest = routes.filter((r) => !r.route.split(' ')[1]!.startsWith('/admin') && !r.isPublic);
    expect(rest.filter((r) => r.audiences?.join() !== 'student').map((r) => r.route)).toEqual(SHARED_ROUTES);
    expect(rest.filter((r) => r.permissions.length > 0).map((r) => r.route)).toEqual([]);
  });
});
