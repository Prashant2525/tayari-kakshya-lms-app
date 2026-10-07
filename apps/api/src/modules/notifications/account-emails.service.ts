import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { MailService } from '../../infra/messaging/mail.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

/** Only accounts made this recently are welcomed (a long outage does not send old welcomes). */
const WINDOW_MS = 3 * 24 * 3_600_000;
const ATTEMPTS = 5;
const RETRY_MS = 10 * 60_000;

/** Fills `{key}` placeholders. */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/**
 * Account emails (D-061): every new student account — whichever device or sign-up route — gets the welcome email from
 * the CMS (`emails.welcome`), which says where courses are bought. It is sent outside the app, as Apple allows
 * (App Review 3.1.3), once per account, by the worker with retries.
 */
@Injectable()
export class AccountEmailsService {
  private readonly logger = new Logger(AccountEmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Pick<Env, 'PUBLIC_WEB_URL'>,
  ) {}

  /** Worker: queues new students for their welcome email, then sends what is due. Returns how many went out. */
  async sendWelcome(now = new Date()): Promise<number> {
    const website = this.env.PUBLIC_WEB_URL?.replace(/\/+$/, '');
    // Without the website address the email has nothing to point to: wait until it is configured.
    if (!website) return 0;
    const welcome = await this.settings.get('emails.welcome');
    const status = welcome.enabled ? 'pending' : 'skipped';
    await this.prisma.$executeRaw`
      INSERT INTO account_emails (id, user_id, kind, status)
      SELECT gen_random_uuid(), u.id, 'welcome', ${status}::"AccountEmailStatus"
      FROM users u
      WHERE u.kind = 'student' AND u.created_at > ${new Date(now.getTime() - WINDOW_MS)}
        AND NOT EXISTS (SELECT 1 FROM account_emails e WHERE e.user_id = u.id AND e.kind = 'welcome')
      ON CONFLICT DO NOTHING`;
    if (!welcome.enabled) return 0;

    const claimed = await this.prisma.$queryRaw<Array<{ id: string; user_id: string; attempts: number }>>`
      UPDATE account_emails SET attempts = attempts + 1, attempt_at = ${now}
      WHERE id IN (
        SELECT id FROM account_emails
        WHERE kind = 'welcome' AND status = 'pending' AND attempts < ${ATTEMPTS}
          AND (attempt_at IS NULL OR attempt_at < ${new Date(now.getTime() - RETRY_MS)})
        ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED
      )
      RETURNING id, user_id, attempts`;
    let sent = 0;
    for (const row of claimed) {
      const user = await this.prisma.user.findUnique({
        where: { id: row.user_id },
        select: { email: true, fullName: true, locale: true, status: true },
      });
      if (!user?.email || user.status !== 'active') {
        await this.prisma.accountEmail.update({ where: { id: row.id }, data: { status: 'skipped' } });
        continue;
      }
      const values = { name: user.fullName, website };
      try {
        await this.mail.send({
          to: user.email,
          subject: fillTemplate(welcome.subject[user.locale], values),
          text: fillTemplate(welcome.body[user.locale], values),
        });
        await this.prisma.accountEmail.update({
          where: { id: row.id },
          data: { status: 'sent', sentAt: now },
        });
        sent += 1;
      } catch (err) {
        this.logger.warn({ err: String(err), accountEmailId: row.id }, 'Welcome email will be retried');
        if (row.attempts >= ATTEMPTS) {
          await this.prisma.accountEmail.update({ where: { id: row.id }, data: { status: 'failed' } });
        }
      }
    }
    return sent;
  }
}
