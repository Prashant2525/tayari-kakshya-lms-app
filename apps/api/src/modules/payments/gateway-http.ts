import { Injectable } from '@nestjs/common';

export interface HttpReply {
  status: number;
  body: unknown;
}

/**
 * Outbound calls to payment gateways (one place, so tests can stand in for the gateways and every call has a
 * timeout). Bodies are parsed as JSON when possible.
 */
@Injectable()
export class GatewayHttp {
  async request(
    method: 'GET' | 'POST',
    url: string,
    opts: { headers?: Record<string, string>; json?: unknown } = {},
  ): Promise<HttpReply> {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(opts.json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...opts.headers,
      },
      body: opts.json === undefined ? undefined : JSON.stringify(opts.json),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON: kept as text.
    }
    return { status: res.status, body };
  }
}
