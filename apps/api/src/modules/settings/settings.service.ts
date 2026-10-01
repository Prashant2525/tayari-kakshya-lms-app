import { Injectable } from '@nestjs/common';
import { SETTINGS, SETTING_KEYS, type SettingKey, type SettingValue } from '@tk/contracts';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import { Errors } from '../../common/errors/app-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

const CACHE_TTL_MS = 5_000;

/** Typed, validated, audited system settings (CMS-managed business configuration). */
@Injectable()
export class SettingsService {
  private cache = new Map<SettingKey, { value: unknown; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value as SettingValue<K>;

    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    const def = SETTINGS[key];
    const parsed = row ? def.schema.safeParse(row.value) : null;
    // A stored value that no longer matches its schema falls back to the default rather than breaking requests.
    const value = (parsed?.success ? parsed.data : def.default) as SettingValue<K>;
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  async getAll(): Promise<Array<{ key: SettingKey; value: unknown; default: unknown; isDefault: boolean }>> {
    const rows = await this.prisma.systemSetting.findMany();
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    return SETTING_KEYS.map((key) => {
      const parsed = stored.has(key) ? SETTINGS[key].schema.safeParse(stored.get(key)) : null;
      return {
        key,
        value: parsed?.success ? parsed.data : SETTINGS[key].default,
        default: SETTINGS[key].default,
        isDefault: !parsed?.success,
      };
    });
  }

  async update<K extends SettingKey>(key: K, value: unknown, actorUserId: string, client?: ClientInfo) {
    const result = SETTINGS[key].schema.safeParse(value);
    if (!result.success) {
      throw Errors.validation(
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    const before = await this.get(key);
    const next = result.data as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: next, updatedById: actorUserId },
        update: { value: next, updatedById: actorUserId },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'settings.update',
          entityType: 'system_setting',
          entityId: key,
          changes: { before: before as Prisma.InputJsonValue, after: next },
          client,
        },
        tx,
      );
    });
    this.cache.delete(key);
    return result.data as SettingValue<K>;
  }

  /** Test/ops helper: forget cached values immediately. */
  clearCache(): void {
    this.cache.clear();
  }
}
