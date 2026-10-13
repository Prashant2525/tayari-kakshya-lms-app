import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@tk/contracts';
import { AppError } from '../../common/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';
import { SmsProviderError, smsProviderFromEnv, type SmsProvider } from './sms-providers.js';

export interface OutgoingSms {
  to: string;
  text: string;
}

/**
 * SMS delivery (D-029, D-076). `sparrow` / `aakash` send through that provider with the account's token
 * (sms-providers.ts); `log` (development / tests only, refused in staging / production) keeps messages in memory;
 * `disabled` refuses to send, so phone verification cannot be switched on by mistake.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger('SmsService');
  readonly outbox: OutgoingSms[] = [];
  private readonly provider: SmsProvider | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.provider = smsProviderFromEnv(env);
  }

  get available(): boolean {
    return this.env.SMS_PROVIDER !== 'disabled';
  }

  async send(sms: OutgoingSms): Promise<void> {
    if (this.env.SMS_PROVIDER === 'disabled') {
      throw new AppError(503, ErrorCode.VERIFICATION_CHANNEL_DISABLED, 'SMS delivery is not configured');
    }
    if (this.provider) {
      try {
        await this.provider.send(sms.to, sms.text);
      } catch (err) {
        // The provider's answer is logged (never the token); the student gets a plain "try again later".
        this.logger.error(
          {
            provider: this.provider.name,
            detail: err instanceof SmsProviderError ? err.detail : String(err),
          },
          'SMS not sent',
        );
        throw new AppError(
          503,
          ErrorCode.INTERNAL_ERROR,
          'The SMS could not be sent. Please try again later.',
        );
      }
      return;
    }
    this.outbox.push(sms);
    if (this.outbox.length > 200) this.outbox.shift();
    this.logger.log({ to: sms.to }, 'SMS captured (log provider)');
  }
}
