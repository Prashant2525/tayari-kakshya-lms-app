import type { PushMessage, PushTicket } from '../src/infra/messaging/push.client.js';

/** Stands in for the Expo Push Service in API tests: keeps what would be sent; tokens can be made "gone". */
export class FakePush {
  readonly sent: PushMessage[] = [];
  /** Tokens Expo reports as no longer registered. */
  readonly gone = new Set<string>();
  down = false;

  reset() {
    this.sent.length = 0;
    this.gone.clear();
    this.down = false;
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    if (this.down) throw new Error('Expo unreachable');
    return messages.map((m) => {
      if (this.gone.has(m.to)) return { status: 'error', details: { error: 'DeviceNotRegistered' } };
      this.sent.push(m);
      return { status: 'ok', id: `ticket-${this.sent.length}` };
    });
  }
}
