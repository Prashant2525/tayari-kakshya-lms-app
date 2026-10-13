import { createHmac, createPublicKey, createVerify } from 'node:crypto';
import type { HttpReply } from '../src/modules/payments/gateway-http.js';

/** The test gateway credentials (setup-env.ts): never real keys. */
export const TEST_ESEWA_SECRET = 'test-esewa-secret';

/**
 * Stands in for eSewa's and Khalti's servers in API tests (the GatewayHttp boundary): answers initiate, lookup and
 * status checks the way the real APIs do, from state each test sets ("the student paid", "the gateway is down").
 */
export class FakeGateways {
  readonly calls: Array<{ method: string; url: string; json?: unknown }> = [];
  /** Khalti payments by pidx. */
  readonly khalti = new Map<
    string,
    { status: string; total_amount: number; transaction_id: string | null }
  >();
  /** eSewa payments by transaction_uuid (amounts in rupees, as eSewa reports them). */
  readonly esewa = new Map<string, { status: string; total_amount: number; ref_id: string | null }>();
  /** ConnectIPS transactions the student completed (TXNID → amount in paisa). */
  readonly connectips = new Map<string, number>();
  down = false;
  private seq = 0;

  reset() {
    this.calls.length = 0;
    this.khalti.clear();
    this.esewa.clear();
    this.connectips.clear();
    this.down = false;
  }

  /** The student completes a Khalti payment (amount in paisa; defaults to what was asked). */
  khaltiPaid(pidx: string, amountPaisa?: number) {
    const p = this.khalti.get(pidx)!;
    this.khalti.set(pidx, {
      ...p,
      status: 'Completed',
      total_amount: amountPaisa ?? p.total_amount,
      transaction_id: `KTX-${pidx}`,
    });
  }

  /** The student completes an eSewa payment (amount in paisa). */
  esewaPaid(transactionUuid: string, amountPaisa: number) {
    this.esewa.set(transactionUuid, {
      status: 'COMPLETE',
      total_amount: amountPaisa / 100,
      ref_id: `ESW-${transactionUuid.slice(-6)}`,
    });
  }

  /** The signed data eSewa puts on the success redirect. */
  static esewaSuccessData(transactionUuid: string, amountPaisa: number, secret = TEST_ESEWA_SECRET): string {
    const payload: Record<string, string> = {
      transaction_code: 'ESW1',
      status: 'COMPLETE',
      total_amount: (amountPaisa / 100).toFixed(1),
      transaction_uuid: transactionUuid,
      product_code: 'EPAYTEST',
      signed_field_names:
        'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
    };
    const message = payload['signed_field_names']!.split(',')
      .map((f) => `${f}=${payload[f]}`)
      .join(',');
    payload['signature'] = createHmac('sha256', secret).update(message).digest('base64');
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /** The student completes a ConnectIPS payment. */
  connectipsPaid(txnId: string, amountPaisa: number) {
    this.connectips.set(txnId, amountPaisa);
  }

  /** NCHL's checks: Basic auth with the application id / password, and the token signed with the merchant key. */
  private connectipsAuthorised(headers: Record<string, string>, body: Record<string, unknown>): boolean {
    const basic = `Basic ${Buffer.from(`${process.env['CONNECTIPS_APP_ID']}:${process.env['CONNECTIPS_APP_PASSWORD']}`).toString('base64')}`;
    if (headers['Authorization'] !== basic) return false;
    const message = `MERCHANTID=${String(body['merchantId'])},APPID=${String(body['appId'])},REFERENCEID=${String(body['referenceId'])},TXNAMT=${String(body['txnAmt'])}`;
    return createVerify('RSA-SHA256')
      .update(message)
      .verify(createPublicKey(process.env['CONNECTIPS_PRIVATE_KEY']!), String(body['token']), 'base64');
  }

  async request(
    method: string,
    url: string,
    opts: { json?: unknown; headers?: Record<string, string> } = {},
  ): Promise<HttpReply> {
    this.calls.push({ method, url, json: opts.json });
    if (this.down) throw new Error('connect ECONNREFUSED (fake gateway down)');
    const u = new URL(url);
    if (u.pathname.endsWith('/creditor/validatetxn') || u.pathname.endsWith('/creditor/gettxndetail')) {
      const body = (opts.json ?? {}) as Record<string, unknown>;
      if (!this.connectipsAuthorised(opts.headers ?? {}, body)) return { status: 401, body: null };
      const paid = this.connectips.get(String(body['referenceId']));
      const ok = paid !== undefined && paid === Number(body['txnAmt']);
      return {
        status: 200,
        body: {
          merchantId: body['merchantId'],
          appId: body['appId'],
          referenceId: body['referenceId'],
          txnAmt: String(body['txnAmt']),
          token: null,
          status: ok ? 'SUCCESS' : 'FAILED',
          statusDesc: ok ? 'TRANSACTION SUCCESSFUL' : 'TRANSACTION NOT FOUND',
        },
      };
    }
    if (u.pathname.endsWith('/epayment/initiate/')) {
      const body = opts.json as { amount: number };
      const pidx = `pidx-${++this.seq}`;
      this.khalti.set(pidx, { status: 'Initiated', total_amount: body.amount, transaction_id: null });
      return {
        status: 200,
        body: { pidx, payment_url: `https://pay.khalti.test/?pidx=${pidx}`, expires_at: '' },
      };
    }
    if (u.pathname.endsWith('/epayment/lookup/')) {
      const { pidx } = opts.json as { pidx: string };
      const p = this.khalti.get(pidx);
      return p ? { status: 200, body: { pidx, ...p } } : { status: 404, body: { detail: 'Not found.' } };
    }
    if (u.pathname.includes('/transaction/status')) {
      const uuid = u.searchParams.get('transaction_uuid')!;
      const p = this.esewa.get(uuid);
      return {
        status: 200,
        body: p
          ? { product_code: 'EPAYTEST', transaction_uuid: uuid, ...p }
          : {
              product_code: 'EPAYTEST',
              transaction_uuid: uuid,
              status: 'NOT_FOUND',
              total_amount: 0,
              ref_id: null,
            },
      };
    }
    return { status: 404, body: null };
  }
}
