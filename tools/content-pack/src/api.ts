/* eslint-disable no-console -- the importer reports waits on the console */
import { createInterface } from 'node:readline/promises';

/**
 * A small Admin API client for the importer: signs in as a staff member (with a two-factor code when the account has
 * one), keeps the refresh cookie, and refreshes the access token when it expires. Credentials come from the
 * environment or a prompt — never from files in the repository.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface Credentials {
  email: string;
  password: string;
  /** A current two-factor code; asked for when the account needs one and none is given. */
  mfaCode?: string | undefined;
}

const CLIENT = { 'X-TK-Client': 'admin' };

export class AdminApi {
  private accessToken = '';
  private refreshCookie = '';
  private readonly base: string;
  private readonly credentials: Credentials;

  constructor(base: string, credentials: Credentials) {
    this.base = base.replace(/\/$/, '');
    this.credentials = credentials;
  }

  private keepCookie(res: Response) {
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('tk_admin_rt='));
    if (cookie) this.refreshCookie = cookie.split(';')[0]!;
  }

  private async json<T>(res: Response): Promise<T> {
    const text = await res.text();
    const body = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      const error = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)
        ?.error;
      const details = error?.details ? ` ${JSON.stringify(error.details)}` : '';
      throw new ApiError(
        res.status,
        error?.code,
        `${res.status} ${error?.code ?? ''} ${error?.message ?? text}${details}`.trim(),
      );
    }
    return body as T;
  }

  async login(): Promise<void> {
    const res = await fetch(`${this.base}/admin/auth/login`, {
      method: 'POST',
      headers: { ...CLIENT, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.credentials.email, password: this.credentials.password }),
    });
    this.keepCookie(res);
    const body = await this.json<{ accessToken?: string; mfaRequired?: boolean; mfaToken?: string }>(res);
    if (body.accessToken) {
      this.accessToken = body.accessToken;
      return;
    }
    if (!body.mfaRequired || !body.mfaToken) throw new Error('Unexpected sign-in response');
    const code = this.credentials.mfaCode ?? (await ask('Two-factor code from your authenticator app: '));
    // A code is used once; a later sign-in asks again.
    this.credentials.mfaCode = undefined;
    const mfa = await fetch(`${this.base}/admin/auth/login/mfa`, {
      method: 'POST',
      headers: { ...CLIENT, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: body.mfaToken, code: code.trim() }),
    });
    this.keepCookie(mfa);
    this.accessToken = (await this.json<{ accessToken: string }>(mfa)).accessToken;
  }

  private async refresh(): Promise<boolean> {
    if (!this.refreshCookie) return false;
    const res = await fetch(`${this.base}/admin/auth/refresh`, {
      method: 'POST',
      headers: { ...CLIENT, Cookie: this.refreshCookie },
    });
    if (!res.ok) return false;
    this.keepCookie(res);
    this.accessToken = (await this.json<{ accessToken: string }>(res)).accessToken;
    return true;
  }

  /**
   * Sends a request; on an expired access token, refreshes (or signs in again) and retries once; when rate limited,
   * waits as long as the API asks and tries again (a big import makes many requests a minute).
   */
  private async send(make: () => Promise<Response>): Promise<Response> {
    let res = await make();
    if (res.status === 401) {
      if (!(await this.refresh())) await this.login();
      res = await make();
    }
    for (let attempt = 0; res.status === 429 && attempt < 8; attempt += 1) {
      const header = Number(res.headers.get('retry-after'));
      const body = (await res.json().catch(() => null)) as {
        error?: { details?: { retryAfterSeconds?: number } };
      } | null;
      const seconds =
        body?.error?.details?.retryAfterSeconds ?? (Number.isFinite(header) && header > 0 ? header : 30);
      console.log(`  (rate limited — waiting ${seconds} s)`);
      await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
      res = await make();
    }
    return res;
  }

  async call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.send(() =>
      fetch(`${this.base}${path}`, {
        method,
        headers: {
          ...CLIENT,
          Authorization: `Bearer ${this.accessToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    return this.json<T>(res);
  }

  /** Uploads a file to the media library. */
  async upload<T>(
    fields: Record<string, string>,
    fileName: string,
    bytes: Uint8Array,
    type: string,
  ): Promise<T> {
    const res = await this.send(() => {
      const form = new FormData();
      // Fields before the file: the API reads them from the multipart stream in order.
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append('file', new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), fileName);
      return fetch(`${this.base}/admin/media`, {
        method: 'POST',
        headers: { ...CLIENT, Authorization: `Bearer ${this.accessToken}` },
        body: form,
      });
    });
    return this.json<T>(res);
  }
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}
