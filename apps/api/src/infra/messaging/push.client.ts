import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  channelId?: string;
}

/** Expo's answer for one message: accepted, or refused with a reason such as DeviceNotRegistered. */
export type PushTicket =
  { status: 'ok'; id?: string } | { status: 'error'; message?: string; details?: { error?: string } };

/**
 * Sends push notifications through the Expo Push Service (T-011), up to 100 messages a request. One place, so tests
 * can stand in for Expo.
 */
@Injectable()
export class PushClient {
  constructor(@Inject(ENV) private readonly env: Pick<Env, 'EXPO_PUSH_URL' | 'EXPO_ACCESS_TOKEN'>) {}

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const res = await fetch(this.env.EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${this.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Expo push answered ${res.status}`);
    const body = (await res.json()) as { data?: PushTicket[] };
    return body.data ?? [];
  }
}
