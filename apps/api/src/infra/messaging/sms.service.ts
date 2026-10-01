import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@tk/contracts';
import { AppError } from '../../common/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';

export interface OutgoingSms {
  to: string;
  text: string;
}

/**
 * SMS delivery. No real provider is integrated yet (OPEN_QUESTIONS L1). `log` (dev/test only) keeps messages
 * in memory; `disabled` refuses to send so phone verification cannot be enabled by mistake.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger('SmsService');
  readonly outbox: OutgoingSms[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {}

  get available(): boolean {
    return this.env.SMS_PROVIDER !== 'disabled';
  }

  async send(sms: OutgoingSms): Promise<void> {
    if (this.env.SMS_PROVIDER === 'disabled') {
      throw new AppError(503, ErrorCode.VERIFICATION_CHANNEL_DISABLED, 'SMS delivery is not configured');
    }
    this.outbox.push(sms);
    if (this.outbox.length > 200) this.outbox.shift();
    this.logger.log({ to: sms.to }, 'SMS captured (log provider)');
  }
}
