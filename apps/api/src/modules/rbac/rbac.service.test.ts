import type { Permission } from '@tk/contracts';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/errors/app-error.js';
import { assertCanGrant } from './rbac.service.js';

const actor = (perms: Permission[], isSuperAdmin = false) => ({ isSuperAdmin, permissions: new Set(perms) });

describe('assertCanGrant', () => {
  it('allows granting a subset of held permissions', () => {
    expect(() => assertCanGrant(actor(['users:read', 'roles:manage']), ['users:read'])).not.toThrow();
  });

  it('rejects permissions the actor does not hold, listing them', () => {
    try {
      assertCanGrant(actor(['users:read']), ['users:read', 'settings:update']);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).details).toEqual({ missing: ['settings:update'] });
    }
  });

  it('rejects unknown permission strings', () => {
    expect(() => assertCanGrant(actor(['users:read']), ['users:delete-everything'])).toThrow(AppError);
  });

  it('lets a Super Admin grant anything', () => {
    expect(() => assertCanGrant(actor([], true), ['settings:update', 'audit:read'])).not.toThrow();
  });
});
