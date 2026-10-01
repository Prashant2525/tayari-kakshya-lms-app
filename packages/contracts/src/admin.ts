import { z } from 'zod';
import { Email } from './auth.js';
import { CursorQuery } from './common.js';
import { isPermission } from './permissions.js';

export const PermissionName = z.string().refine(isPermission, { message: 'Unknown permission' });

export const RoleInput = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(PermissionName).max(200),
});
export type RoleInput = z.infer<typeof RoleInput>;

export const CreateStaffInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: Email,
  roleIds: z.array(z.uuid()).max(20).default([]),
});
export type CreateStaffInput = z.infer<typeof CreateStaffInput>;

export const SetRolesInput = z.object({ roleIds: z.array(z.uuid()).max(20) });
export type SetRolesInput = z.infer<typeof SetRolesInput>;

export const AdminUserListQuery = CursorQuery.extend({
  cursor: z.uuid().optional(),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'suspended', 'pending_deletion', 'deleted']).optional(),
});
export type AdminUserListQuery = z.infer<typeof AdminUserListQuery>;

export const UpdateAdminUserInput = z
  .object({ deviceLimitOverride: z.number().int().min(1).max(20).nullable() })
  .partial()
  .strict();
export type UpdateAdminUserInput = z.infer<typeof UpdateAdminUserInput>;

export const AuditLogQuery = CursorQuery.extend({
  cursor: z.uuid().optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(120).optional(),
  actorUserId: z.uuid().optional(),
  action: z.string().max(80).optional(),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuery>;

export const UpdateSettingInput = z.object({ value: z.unknown() });
export type UpdateSettingInput = z.infer<typeof UpdateSettingInput>;
