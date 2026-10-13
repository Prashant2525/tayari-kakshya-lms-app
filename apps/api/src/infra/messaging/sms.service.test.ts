import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/env.js';
import { SmsService } from './sms.service.js';

const service = (extra: Partial<Env>) =>
  new SmsService({ SMS_PROVIDER: 'disabled', ...extra } as unknown as Env);

describe('SmsService (D-076)', () => {
  it('refuses when disabled, keeps messages with log', async () => {
    await expect(service({}).send({ to: '+9779812345678', text: 'x' })).rejects.toMatchObject({
      status: 503,
    });
    const log = service({ SMS_PROVIDER: 'log' });
    await log.send({ to: '+9779812345678', text: 'code' });
    expect(log.outbox).toEqual([{ to: '+9779812345678', text: 'code' }]);
  });

  it('a provider that cannot be reached is a plain 503 for the student (details only in the log)', async () => {
    const sparrow = service({
      SMS_PROVIDER: 'sparrow',
      SMS_API_KEY: 'token',
      SMS_SENDER_ID: 'Sender',
      SMS_BASE_URL: 'http://127.0.0.1:9',
    });
    expect(sparrow.available).toBe(true);
    await expect(sparrow.send({ to: '+9779812345678', text: 'x' })).rejects.toMatchObject({
      status: 503,
      message: 'The SMS could not be sent. Please try again later.',
    });
    expect(sparrow.outbox).toEqual([]);
  });
});
