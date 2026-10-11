import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationCategory,
  type LocalizedText,
  type NotificationPreferencesInput,
  type NotificationsQuery,
  type PushTokenInput,
} from '@tk/contracts';
import { Prisma, type NotificationDelivery } from '../../generated/prisma/client.js';
import { MailService } from '../../infra/messaging/mail.service.js';
import { PushClient, type PushMessage } from '../../infra/messaging/push.client.js';
import { BuyingGuideService } from './buying-guide.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/** Where tapping a notification leads (the app maps it to a screen). */
export type NotificationLink =
  | { type: 'notice'; id: string }
  | { type: 'course'; slug: string }
  | { type: 'plan'; slug: string }
  | { type: 'order'; id: string }
  | { type: 'assessment'; id: string }
  | { type: 'attempt'; id: string }
  | { type: 'article'; slug: string }
  | { type: 'discussion'; target: 'question' | 'lesson'; id: string };

export interface OutgoingNotification {
  category: NotificationCategory;
  title: LocalizedText;
  body: LocalizedText;
  link: NotificationLink | null;
  /** The event, e.g. `notice:<id>`: each student gets it once per channel, however often it is sent. */
  sourceKey: string;
  /** Show it in the student's in-app list (notices have their own tab instead). */
  inApp: boolean;
  push: boolean;
  email: boolean;
}

type Prefs = NotificationPreferencesInput;
const CATEGORIES = NotificationCategory.options;
/** D-033: everything is on until the student turns it off. */
export const DEFAULT_PREFERENCES: Prefs = Object.fromEntries(
  CATEGORIES.map((c) => [c, { push: true, email: true }]),
) as Prefs;

const BATCH = 1000;
const STUDENT_BATCH = 2000;
const MAX_ATTEMPTS = 5;
const RETRY_MS = 5 * 60_000;

const EMAIL_FOOTER = {
  en: 'Open the Tayari Kakshya app to read more. You can turn these emails off in Profile → Notifications.',
  ne: 'थप पढ्न तयारी कक्षा एप खोल्नुहोस्। यी इमेलहरू प्रोफाइल → सूचनाहरूमा बन्द गर्न सकिन्छ।',
} as const;

const pick = (text: LocalizedText, locale: 'en' | 'ne') => text[locale] ?? text.en ?? text.ne ?? '';

/**
 * Notifications (D-033): an in-app list per student, and push (Expo) and email deliveries queued in the database and
 * sent by the worker with retries — each student's category choices decide the push / email part. An event reaches a
 * student at most once per channel (`sourceKey`).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushClient,
    private readonly mail: MailService,
    private readonly guide: BuyingGuideService,
  ) {}

  /**
   * Queues a notification for these students (any number: done in batches). Pass the transaction of the change that
   * caused it, so the two are saved together.
   */
  async notify(
    userIds: string[],
    n: OutgoingNotification,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const unique = [...new Set(userIds)];
    for (let i = 0; i < unique.length; i += BATCH) {
      const batch = unique.slice(i, i + BATCH);
      const stored = await db.notificationPreference.findMany({ where: { userId: { in: batch } } });
      const prefs = new Map(stored.map((p) => [p.userId, p.prefs as Prefs]));
      const wants = (userId: string, channel: 'push' | 'email') =>
        (prefs.get(userId)?.[n.category] ?? DEFAULT_PREFERENCES[n.category])[channel];
      const base = {
        category: n.category,
        title: n.title as Prisma.InputJsonValue,
        body: n.body as Prisma.InputJsonValue,
        link: (n.link ?? Prisma.DbNull) as Prisma.InputJsonValue,
        sourceKey: n.sourceKey,
      };
      if (n.inApp) {
        await db.notification.createMany({
          data: batch.map((userId) => ({ userId, ...base })),
          skipDuplicates: true,
        });
      }
      const deliveries = batch.flatMap((userId) => [
        ...(n.push && wants(userId, 'push') ? [{ userId, channel: 'push' as const, ...base }] : []),
        ...(n.email && wants(userId, 'email') ? [{ userId, channel: 'email' as const, ...base }] : []),
      ]);
      if (deliveries.length) {
        await db.notificationDelivery.createMany({ data: deliveries, skipDuplicates: true });
      }
    }
  }

  /** Queues a notification for every active student (notices and articles that went live), in batches. */
  async notifyAllStudents(n: OutgoingNotification): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const students = await this.prisma.user.findMany({
        where: { kind: 'student', status: 'active' },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: STUDENT_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!students.length) return;
      await this.notify(
        students.map((s) => s.id),
        n,
      );
      cursor = students.at(-1)!.id;
      if (students.length < STUDENT_BATCH) return;
    }
  }

  /**
   * Worker: sends due push and email deliveries (claimed one batch at a time, so two workers never send the same one).
   * Returns how many went out.
   */
  async processDeliveries(now = new Date()): Promise<number> {
    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE notification_deliveries SET attempts = attempts + 1, next_attempt_at = ${new Date(now.getTime() + RETRY_MS)}
      WHERE id IN (
        SELECT id FROM notification_deliveries
        WHERE status = 'pending' AND next_attempt_at <= ${now}
        ORDER BY next_attempt_at LIMIT 300 FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    if (!claimed.length) return 0;
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { id: { in: claimed.map((c) => c.id) } },
      include: { user: { select: { email: true, locale: true, status: true } } },
    });
    let sent = 0;
    sent += await this.sendPush(
      rows.filter((r) => r.channel === 'push'),
      now,
    );
    for (const row of rows.filter((r) => r.channel === 'email')) {
      if (!row.user.email || row.user.status !== 'active') {
        await this.finish(row.id, 'skipped', null);
        continue;
      }
      try {
        const locale = row.user.locale;
        const body = await this.guide.compose(
          `${pick(row.body as LocalizedText, locale)}\n\n${EMAIL_FOOTER[locale]}`,
          locale,
        );
        await this.mail.send({
          to: row.user.email,
          subject: pick(row.title as LocalizedText, locale),
          ...body,
        });
        await this.finish(row.id, 'sent', null, now);
        sent += 1;
      } catch (err) {
        await this.retryOrFail(row, String(err));
      }
    }
    return sent;
  }

  private async sendPush(
    rows: Array<NotificationDelivery & { user: { locale: 'en' | 'ne'; status: string } }>,
    now: Date,
  ): Promise<number> {
    if (!rows.length) return 0;
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: [...new Set(rows.map((r) => r.userId))] }, invalidatedAt: null },
    });
    const byUser = new Map<string, string[]>();
    for (const t of tokens) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t.token]);
    const messages: Array<{ row: (typeof rows)[number]; message: PushMessage }> = [];
    for (const row of rows) {
      const to = row.user.status === 'active' ? (byUser.get(row.userId) ?? []) : [];
      if (!to.length) {
        await this.finish(row.id, 'skipped', null);
        continue;
      }
      for (const token of to) {
        messages.push({
          row,
          message: {
            to: token,
            title: pick(row.title as LocalizedText, row.user.locale),
            body: pick(row.body as LocalizedText, row.user.locale),
            data: { link: row.link, category: row.category },
            sound: 'default',
            channelId: 'default',
          },
        });
      }
    }
    const outcome = new Map<string, { ok: boolean; error?: string }>();
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        const tickets = await this.push.send(chunk.map((c) => c.message));
        for (const [n, c] of chunk.entries()) {
          const ticket = tickets[n];
          const prev = outcome.get(c.row.id);
          if (ticket?.status === 'ok') outcome.set(c.row.id, { ok: true });
          else {
            const error = ticket?.details?.error ?? ticket?.message ?? 'no ticket';
            if (error === 'DeviceNotRegistered') {
              await this.prisma.pushToken.updateMany({
                where: { token: c.message.to },
                data: { invalidatedAt: now },
              });
            }
            if (!prev?.ok) outcome.set(c.row.id, { ok: false, error });
          }
        }
      } catch (err) {
        for (const c of chunk)
          if (!outcome.get(c.row.id)?.ok) outcome.set(c.row.id, { ok: false, error: String(err) });
      }
    }
    let sent = 0;
    for (const row of rows) {
      const o = outcome.get(row.id);
      if (!o) continue;
      if (o.ok) {
        await this.finish(row.id, 'sent', null, now);
        sent += 1;
      } else if (o.error === 'DeviceNotRegistered') {
        await this.finish(row.id, 'skipped', o.error);
      } else {
        await this.retryOrFail(row, o.error ?? 'failed');
      }
    }
    return sent;
  }

  private finish(id: string, status: 'sent' | 'skipped' | 'failed', error: string | null, now = new Date()) {
    return this.prisma.notificationDelivery.update({
      where: { id },
      data: { status, error, sentAt: status === 'sent' ? now : null },
    });
  }

  private async retryOrFail(row: { id: string; attempts: number }, error: string) {
    this.logger.warn({ deliveryId: row.id, error }, 'Notification delivery failed');
    // `attempts` was raised when the row was claimed.
    if (row.attempts >= MAX_ATTEMPTS) await this.finish(row.id, 'failed', error.slice(0, 500));
    else
      await this.prisma.notificationDelivery.update({
        where: { id: row.id },
        data: { error: error.slice(0, 500) },
      });
  }

  // ───────────── The student's side ─────────────

  async inbox(userId: string, query: NotificationsQuery) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((n) => ({
        id: n.id,
        category: n.category,
        title: n.title as LocalizedText,
        body: n.body as LocalizedText,
        link: n.link as NotificationLink | null,
        createdAt: n.createdAt.toISOString(),
        read: n.readAt !== null,
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, ids: string[], now = new Date()) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids.length ? { id: { in: ids } } : {}) },
      data: { readAt: now },
    });
  }

  async preferences(userId: string): Promise<Prefs> {
    const row = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return { ...DEFAULT_PREFERENCES, ...((row?.prefs as Partial<Prefs> | undefined) ?? {}) };
  }

  async setPreferences(userId: string, prefs: Prefs) {
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, prefs: prefs as Prisma.InputJsonValue },
      update: { prefs: prefs as Prisma.InputJsonValue },
    });
    return this.preferences(userId);
  }

  /** A device's token: (re)assigned to this student (a phone that changed hands moves with its sign-in). */
  async registerToken(userId: string, input: PushTokenInput, now = new Date()) {
    await this.prisma.pushToken.upsert({
      where: { token: input.token },
      create: { userId, token: input.token, platform: input.platform },
      update: { userId, platform: input.platform, lastSeenAt: now, invalidatedAt: null },
    });
  }

  async removeToken(userId: string, token: string, now = new Date()) {
    await this.prisma.pushToken.updateMany({ where: { userId, token }, data: { invalidatedAt: now } });
  }
}
