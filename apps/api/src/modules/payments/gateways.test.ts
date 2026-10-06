import { describe, expect, it } from 'vitest';
import type { GatewayHttp, HttpReply } from './gateway-http.js';
import { EsewaGateway, esewaAmount, KhaltiGateway } from './gateways.js';

/**
 * eSewa's published UAT key (developer.esewa.com.np/pages/Epay, checked 2026-10-06). The page shows a trailing "(";
 * the key without it is the one that reproduces eSewa's own signed success response below.
 */
const ESEWA_UAT_KEY = '8gBm/:&EnhH.1/q';

const fakeHttp = (reply: HttpReply, seen: unknown[] = []): GatewayHttp =>
  ({
    request: async (method: string, url: string, opts?: unknown) => {
      seen.push({ method, url, opts });
      return reply;
    },
  }) as unknown as GatewayHttp;

const esewa = (http = fakeHttp({ status: 200, body: {} })) =>
  new EsewaGateway(
    {
      mode: 'sandbox',
      productCode: 'EPAYTEST',
      secretKey: ESEWA_UAT_KEY,
      formUrl: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
      statusUrl: 'https://rc.esewa.com.np/api/epay/transaction/status/',
    },
    http,
  );

describe('eSewa ePay v2', () => {
  // The docs' request-signature example matches no form of the key; the request format is checked against eSewa's
  // UAT server instead (see TEST_STATUS), and pinned here.
  it('signs total_amount, transaction_uuid and product_code in that order', () => {
    const fields = esewa().formFields({
      paymentId: '11-201-13',
      amountPaisa: 10_000,
      orderName: 'x',
      customer: { name: 'x', email: null, phone: null },
      callbackBase: 'https://api.example.com',
    });
    expect(fields).toMatchObject({
      total_amount: '100',
      transaction_uuid: '11-201-13',
      product_code: 'EPAYTEST',
      signed_field_names: 'total_amount,transaction_uuid,product_code',
      signature: '5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E=',
      success_url: 'https://api.example.com/api/v1/payments/esewa/return',
    });
    expect(esewaAmount(10_050)).toBe('100.50');
  });

  it("accepts eSewa's published signed success response and rejects altered ones", () => {
    const official =
      'eyJ0cmFuc2FjdGlvbl9jb2RlIjoiMDAwQVdFTyIsInN0YXR1cyI6IkNPTVBMRVRFIiwidG90YWxfYW1vdW50IjoiMTAwMC4wIiwidHJhbnNhY3Rpb25fdXVpZCI6IjI1MDYxMC0xNjI0MTMiLCJwcm9kdWN0X2NvZGUiOiJFUEFZVEVTVCIsInNpZ25lZF9maWVsZF9uYW1lcyI6InRyYW5zYWN0aW9uX2NvZGUsc3RhdHVzLHRvdGFsX2Ftb3VudCx0cmFuc2FjdGlvbl91dWlkLHByb2R1Y3RfY29kZSxzaWduZWRfZmllbGRfbmFtZXMiLCJzaWduYXR1cmUiOiI2MkdjZlpUbVZremh0VWVoK1FKMUFxaUpyam9XV0dvZjNVK2VUUFRaN2ZBPSJ9';
    expect(esewa().readRedirect(official)).toMatchObject({ transactionUuid: '250610-162413' });

    const decoded = JSON.parse(Buffer.from(official, 'base64').toString()) as Record<string, string>;
    const altered = Buffer.from(JSON.stringify({ ...decoded, total_amount: '1.0' })).toString('base64');
    expect(esewa().readRedirect(altered)).toBeNull();
    expect(esewa().readRedirect('not base64 json')).toBeNull();
    const unsigned = Buffer.from(JSON.stringify({ ...decoded, signature: '' })).toString('base64');
    expect(esewa().readRedirect(unsigned)).toBeNull();
  });

  it('reads the status check: COMPLETE with amount, NOT_FOUND / PENDING stay pending, CANCELED', async () => {
    const seen: unknown[] = [];
    let g = esewa(
      fakeHttp(
        {
          status: 200,
          body: { status: 'COMPLETE', total_amount: 100.0, ref_id: '0001TS9', transaction_uuid: '123' },
        },
        seen,
      ),
    );
    expect(await g.check('123', 10_000)).toMatchObject({
      status: 'completed',
      amountPaisa: 10_000,
      transactionId: '0001TS9',
    });
    expect((seen[0] as { url: string }).url).toBe(
      'https://rc.esewa.com.np/api/epay/transaction/status/?product_code=EPAYTEST&total_amount=100&transaction_uuid=123',
    );
    for (const [status, expected] of [
      ['NOT_FOUND', 'pending'],
      ['PENDING', 'pending'],
      ['AMBIGUOUS', 'pending'],
      ['CANCELED', 'cancelled'],
      ['FULL_REFUND', 'failed'],
    ] as const) {
      g = esewa(fakeHttp({ status: 200, body: { status, total_amount: 100 } }));
      expect((await g.check('123', 10_000)).status).toBe(expected);
    }
    await expect(esewa(fakeHttp({ status: 503, body: 'down' })).check('123', 10_000)).rejects.toThrow();
  });
});

describe('Khalti KPG-2', () => {
  const khalti = (http: GatewayHttp) =>
    new KhaltiGateway(
      { mode: 'sandbox', secretKey: 'test-key', baseUrl: 'https://dev.khalti.com/api/v2' },
      http,
    );

  it('starts a payment with the amount in paisa and the server-side key', async () => {
    const seen: Array<{
      url: string;
      opts: { headers: Record<string, string>; json: Record<string, unknown> };
    }> = [];
    const started = await khalti(
      fakeHttp(
        { status: 200, body: { pidx: 'PIDX1', payment_url: 'https://test-pay.khalti.com/?pidx=PIDX1' } },
        seen as unknown[],
      ),
    ).initiate({
      paymentId: 'pay-1',
      amountPaisa: 150_000,
      orderName: 'Course',
      customer: { name: 'Asha', email: 'a@example.com', phone: null },
      callbackBase: 'https://api.example.com',
    });
    expect(started).toMatchObject({ pidx: 'PIDX1', paymentUrl: 'https://test-pay.khalti.com/?pidx=PIDX1' });
    expect(seen[0]!.url).toBe('https://dev.khalti.com/api/v2/epayment/initiate/');
    expect(seen[0]!.opts.headers['Authorization']).toBe('Key test-key');
    expect(seen[0]!.opts.json).toMatchObject({
      amount: 150_000,
      purchase_order_id: 'pay-1',
      return_url: 'https://api.example.com/api/v1/payments/khalti/return',
      customer_info: { name: 'Asha', email: 'a@example.com' },
    });
    await expect(
      khalti(fakeHttp({ status: 400, body: { detail: 'Invalid' } })).initiate({
        paymentId: 'p',
        amountPaisa: 100,
        orderName: 'x',
        customer: { name: 'x', email: null, phone: null },
        callbackBase: 'https://api.example.com',
      }),
    ).rejects.toThrow('Khalti could not start the payment');
  });

  it('maps the lookup statuses; only Completed is completed', async () => {
    for (const [status, expected] of [
      ['Completed', 'completed'],
      ['Pending', 'pending'],
      ['Initiated', 'pending'],
      ['User canceled', 'cancelled'],
      ['Expired', 'expired'],
      ['Refunded', 'failed'],
    ] as const) {
      const v = await khalti(
        fakeHttp({ status: 200, body: { status, total_amount: 150_000, transaction_id: 'T1' } }),
      ).check('PIDX1');
      expect(v.status).toBe(expected);
    }
    await expect(khalti(fakeHttp({ status: 401, body: {} })).check('PIDX1')).rejects.toThrow();
  });
});
