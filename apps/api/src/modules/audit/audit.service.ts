import { Injectable } from '@nestjs/common';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';

export interface AuditEntry {
  actorUserId: string | null;
  actorType?: 'user' | 'system';
  action: string;
  entityType: string;
  entityId?: string | null;
  changes?: Prisma.InputJsonValue;
  client?: ClientInfo;
}

const SECRET_KEYS = /password|token|secret|hash|code|pepper/i;

/** Removes secret-looking fields before anything is written to the audit log. */
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_KEYS.test(k) ? '[redacted]' : scrub(v),
      ]),
    );
  }
  return value;
}

/** Append-only audit trail for staff actions, security events and (later) all financial state changes. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        actorType: entry.actorType ?? (entry.actorUserId ? 'user' : 'system'),
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        changes: entry.changes === undefined ? undefined : (scrub(entry.changes) as Prisma.InputJsonValue),
        ip: entry.client?.ip ?? null,
        userAgent: entry.client?.userAgent ?? null,
        requestId: entry.client?.requestId ?? null,
      },
    });
  }
}
