import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV, type Env } from '../../config/env.js';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

/**
 * Email delivery. `smtp` sends through the configured server (Mailpit in development);
 * `log` (dev/test only — rejected in staging/production by env validation) keeps messages in memory.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService');
  private readonly transporter?: Transporter;
  /** Last messages sent with the `log` provider (used by automated tests). */
  readonly outbox: OutgoingMail[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    if (env.EMAIL_PROVIDER === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      });
    }
  }

  async send(mail: OutgoingMail): Promise<void> {
    if (!this.transporter) {
      this.outbox.push(mail);
      if (this.outbox.length > 200) this.outbox.shift();
      this.logger.log({ to: mail.to, subject: mail.subject }, 'Email captured (log provider)');
      return;
    }
    await this.transporter.sendMail({ from: this.env.EMAIL_FROM, ...mail });
  }
}
