/**
 * Nepal SMS providers (D-076, configuration readiness G-2), chosen with SMS_PROVIDER. Both are used through their
 * public HTTP APIs with the account's token; numbers go out as 10-digit Nepal mobile numbers.
 * - Sparrow SMS (docs.sparrowsms.com): POST /v2/sms/ with token, from (the approved sender identity), to, text;
 *   credit: GET /v2/credit/?token=…
 * - Aakash SMS (aakashsms.com): POST /sms/v3/send with auth_token, to, text; credit: POST /sms/v1/credit.
 * Endpoints and answers are to be confirmed with the chosen provider's current documentation on its first test send.
 */

export type FormPost = (
  url: string,
  form: Record<string, string>,
  method?: 'GET' | 'POST',
) => Promise<{ status: number; body: unknown }>;

export interface SmsProvider {
  readonly name: 'sparrow' | 'aakash';
  send(to: string, text: string): Promise<void>;
  /** Configuration check: the token is accepted (no message is sent). */
  credit(): Promise<string>;
}

export class SmsProviderError extends Error {
  constructor(
    message: string,
    readonly detail: { status: number; body: unknown },
  ) {
    super(message);
  }
}

/** +97798XXXXXXXX / 97798… / 98… → 98XXXXXXXX (what both providers take). */
export function nepalMobile(number: string): string {
  const digits = number.replace(/\D/g, '');
  const local = digits.startsWith('977') && digits.length === 13 ? digits.slice(3) : digits;
  if (!/^9[678]\d{8}$/.test(local)) throw new Error('Not a Nepal mobile number');
  return local;
}

/** POSTs (or GETs) an urlencoded form with a timeout; JSON answers are parsed. */
export const formPost: FormPost = async (url, form, method = 'POST') => {
  const target = new URL(url);
  if (method === 'GET') for (const [k, v] of Object.entries(form)) target.searchParams.set(k, v);
  const res = await fetch(target, {
    method,
    headers: {
      Accept: 'application/json',
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: kept as text.
  }
  return { status: res.status, body };
};

const record = (body: unknown) => (body && typeof body === 'object' ? (body as Record<string, unknown>) : {});

export class SparrowSms implements SmsProvider {
  readonly name = 'sparrow' as const;
  constructor(
    private readonly token: string,
    private readonly from: string,
    private readonly baseUrl: string,
    private readonly post: FormPost = formPost,
  ) {}

  async send(to: string, text: string): Promise<void> {
    const reply = await this.post(`${this.baseUrl}/v2/sms/`, {
      token: this.token,
      from: this.from,
      to: nepalMobile(to),
      text,
    });
    if (reply.status !== 200 || Number(record(reply.body)['response_code']) !== 200) {
      throw new SmsProviderError('Sparrow SMS did not accept the message', reply);
    }
  }

  async credit(): Promise<string> {
    const reply = await this.post(`${this.baseUrl}/v2/credit/`, { token: this.token }, 'GET');
    const body = record(reply.body);
    if (reply.status !== 200 || Number(body['response_code'] ?? 200) !== 200) {
      throw new SmsProviderError('Sparrow SMS refused the token', reply);
    }
    return `token accepted, ${String(body['credits_available'] ?? '?')} credits`;
  }
}

export class AakashSms implements SmsProvider {
  readonly name = 'aakash' as const;
  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
    private readonly post: FormPost = formPost,
  ) {}

  async send(to: string, text: string): Promise<void> {
    const reply = await this.post(`${this.baseUrl}/sms/v3/send`, {
      auth_token: this.token,
      to: nepalMobile(to),
      text,
    });
    const body = record(reply.body);
    if (reply.status !== 200 || body['error'] !== false) {
      throw new SmsProviderError('Aakash SMS did not accept the message', reply);
    }
  }

  async credit(): Promise<string> {
    const reply = await this.post(`${this.baseUrl}/sms/v1/credit`, { auth_token: this.token });
    const body = record(reply.body);
    if (reply.status !== 200 || body['error'] === true) {
      throw new SmsProviderError('Aakash SMS refused the token', reply);
    }
    const credit = body['available_credit'] ?? record(body['data'])['available_credit'];
    return `token accepted, ${String(credit ?? '?')} credits`;
  }
}

export const SMS_BASE_URLS = {
  sparrow: 'https://api.sparrowsms.com',
  aakash: 'https://sms.aakashsms.com',
} as const;

/** The provider SMS_PROVIDER names (null for `disabled` / `log`). */
export function smsProviderFromEnv(
  env: { SMS_PROVIDER: string; SMS_API_KEY?: string; SMS_SENDER_ID?: string; SMS_BASE_URL?: string },
  post: FormPost = formPost,
): SmsProvider | null {
  const base = (name: keyof typeof SMS_BASE_URLS) =>
    (env.SMS_BASE_URL ?? SMS_BASE_URLS[name]).replace(/\/+$/, '');
  if (env.SMS_PROVIDER === 'sparrow')
    return new SparrowSms(env.SMS_API_KEY!, env.SMS_SENDER_ID!, base('sparrow'), post);
  if (env.SMS_PROVIDER === 'aakash') return new AakashSms(env.SMS_API_KEY!, base('aakash'), post);
  return null;
}
