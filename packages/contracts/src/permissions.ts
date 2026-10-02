/**
 * Permission catalog (D-036). Permissions are defined in code; roles that bundle them are data created by the
 * Super Admin. Each module appends its permissions here when it is implemented.
 */
export const PERMISSIONS = {
  'users:read': 'View students and their account details',
  'users:update': 'Edit student accounts',
  'users:suspend': 'Suspend or reactivate accounts and revoke sessions',
  'staff:read': 'View staff accounts',
  'staff:manage': 'Create staff accounts and assign roles',
  'roles:manage': 'Create, edit and delete roles and their permissions',
  'settings:read': 'View system settings',
  'settings:update': 'Change system settings',
  'audit:read': 'View the audit log',
  'education_levels:manage': 'Manage the education level options shown on student profiles',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}
