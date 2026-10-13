import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { GatewayHttp, HttpReply } from './gateway-http.js';
import {
  ConnectIpsGateway,
  connectIpsDate,
  connectIpsTxnId,
  EsewaGateway,
  esewaAmount,
  KhaltiGateway,
  readConnectIpsKey,
} from './gateways.js';

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

describe('ConnectIPS (NCHL, D-076)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const verify = (message: string, token: string) =>
    createVerify('RSA-SHA256').update(message).verify(publicKey, token, 'base64');
  const cips = (http = fakeHttp({ status: 200, body: {} })) =>
    new ConnectIpsGateway(
      {
        mode: 'sandbox',
        merchantId: '301',
        appId: 'MER-301-APP-1',
        appName: 'Tayari Kakshya',
        appPassword: 'app-password',
        privateKey: readConnectIpsKey(pem),
        baseUrl: 'https://uat.connectips.com',
      },
      http,
    );

  it('reads the private key as PEM, as PEM on one line with \\n, or as base64 PEM', () => {
    for (const value of [pem, pem.replace(/\n/g, '\\n'), Buffer.from(pem).toString('base64')]) {
      expect(readConnectIpsKey(value).asymmetricKeyType).toBe('rsa');
    }
    expect(() => readConnectIpsKey('not a key')).toThrow();
  });

  it('builds the form: ids, Nepal date, paisa, and a TOKEN signed over every field', () => {
    const now = new Date('2026-10-13T20:30:00Z'); // 14 Oct, 02:15 in Nepal
    expect(connectIpsDate(now)).toBe('14-10-2026');
    const txnId = connectIpsTxnId('019a1b2c-3d4e-7f00-8a1b-2c3d4e5f6a7b');
    expect(txnId).toBe('019a1b2c3d4e7f008a1b');
    const fields = cips().formFields({
      txnId,
      amountPaisa: 250_000,
      remarks: 'Order 12',
      particulars: 'Course',
      now,
    });
    expect(fields).toMatchObject({
      MERCHANTID: '301',
      APPID: 'MER-301-APP-1',
      APPNAME: 'Tayari Kakshya',
      TXNID: txnId,
      TXNDATE: '14-10-2026',
      TXNCRNCY: 'NPR',
      TXNAMT: '250000',
      REFERENCEID: txnId,
    });
    const message = `MERCHANTID=301,APPID=MER-301-APP-1,APPNAME=Tayari Kakshya,TXNID=${txnId},TXNDATE=14-10-2026,TXNCRNCY=NPR,TXNAMT=250000,REFERENCEID=${txnId},REMARKS=Order 12,PARTICULARS=Course,TOKEN=TOKEN`;
    expect(verify(message, fields.TOKEN)).toBe(true);
    expect(verify(message.replace('250000', '25000'), fields.TOKEN)).toBe(false);
  });

  it('validates server to server with Basic auth and a signed body; only SUCCESS completes', async () => {
    const seen: Array<{
      url: string;
      opts: { headers: Record<string, string>; json: Record<string, unknown> };
    }> = [];
    const success = cips(
      fakeHttp(
        { status: 200, body: { status: 'SUCCESS', referenceId: 'TX1', txnAmt: 250000 } },
        seen as unknown[],
      ),
    );
    expect(await success.check('TX1', 250_000)).toMatchObject({
      status: 'completed',
      amountPaisa: 250_000,
      transactionId: 'TX1',
    });
    const call = seen[0]!;
    expect(call.url).toBe('https://uat.connectips.com/connectipswebws/api/creditor/validatetxn');
    expect(call.opts.headers['Authorization']).toBe(
      `Basic ${Buffer.from('MER-301-APP-1:app-password').toString('base64')}`,
    );
    expect(call.opts.json).toMatchObject({
      merchantId: 301,
      appId: 'MER-301-APP-1',
      referenceId: 'TX1',
      txnAmt: 250000,
    });
    expect(
      verify(
        'MERCHANTID=301,APPID=MER-301-APP-1,REFERENCEID=TX1,TXNAMT=250000',
        call.opts.json['token'] as string,
      ),
    ).toBe(true);

    for (const body of [
      { status: 'FAILED' },
      { status: 'ERROR' },
      {},
      { status: 'SUCCESS', referenceId: 'OTHER' },
    ]) {
      expect((await cips(fakeHttp({ status: 200, body })).check('TX1', 250_000)).status).toBe('pending');
    }
    await expect(cips(fakeHttp({ status: 401, body: {} })).check('TX1', 1)).rejects.toThrow(/ConnectIPS/);
  });
});

describe('configuration probes (D-076, G-4)', () => {
  it('Khalti: an unknown payment (404) means the key works; 401 means it does not', async () => {
    const khalti = (status: number) =>
      new KhaltiGateway(
        { mode: 'sandbox', secretKey: 'k', baseUrl: 'https://dev.khalti.com/api/v2' },
        fakeHttp({ status, body: {} }),
      );
    expect((await khalti(404).probe()).ok).toBe(true);
    expect((await khalti(401).probe()).ok).toBe(false);
    expect((await khalti(503).probe()).ok).toBe(false);
  });

  it('eSewa: the status API answers', async () => {
    expect((await esewa(fakeHttp({ status: 200, body: { status: 'NOT_FOUND' } })).probe()).ok).toBe(true);
    expect((await esewa(fakeHttp({ status: 502, body: null })).probe()).ok).toBe(false);
  });
});
