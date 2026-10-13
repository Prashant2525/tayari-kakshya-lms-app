import { createHmac, createPrivateKey, createSign, timingSafeEqual, type KeyObject } from 'node:crypto';
import type { Env } from '../../config/env.js';
import type { GatewayHttp } from './gateway-http.js';

/**
 * eSewa ePay v2 and Khalti KPG-2 (D-003), from their official documentation (checked 2026-10-06):
 * developer.esewa.com.np/pages/Epay and docs.khalti.com/khalti-epayment; ConnectIPS (D-076) below. Every merchant value and endpoint comes
 * from .env (D-051); the official endpoints for each mode are the defaults.
 */

export type GatewayName = 'esewa' | 'khalti' | 'connectips';

/** What the gateway says about a payment, checked server to server. Only `completed` ever grants access. */
export interface GatewayVerdict {
  status: 'completed' | 'pending' | 'failed' | 'cancelled' | 'expired';
  /** The amount the gateway says was paid (paisa), when it says. */
  amountPaisa: number | null;
  transactionId: string | null;
  /** The gateway's reply, for the payment's event log (no secrets). */
  raw: unknown;
}

export interface InitiateRequest {
  paymentId: string;
  amountPaisa: number;
  orderName: string;
  customer: { name: string; email: string | null; phone: string | null };
  /** Public origin of this API (PAYMENT_CALLBACK_BASE_URL). */
  callbackBase: string;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

// ───────────── eSewa ─────────────

const ESEWA_URLS = {
  sandbox: {
    form: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://rc.esewa.com.np/api/epay/transaction/status/',
  },
  production: {
    form: 'https://epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://esewa.com.np/api/epay/transaction/status/',
  },
} as const;

export interface EsewaConfig {
  mode: 'sandbox' | 'production';
  productCode: string;
  secretKey: string;
  formUrl: string;
  statusUrl: string;
}

/** eSewa takes amounts in rupees; the exact text is signed, so it is produced in one place. */
export function esewaAmount(paisa: number): string {
  return paisa % 100 === 0 ? String(paisa / 100) : (paisa / 100).toFixed(2);
}

function esewaSignature(message: string, secretKey: string): string {
  return createHmac('sha256', secretKey).update(message).digest('base64');
}

function sameSignature(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const rupeesToPaisaLoose = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export class EsewaGateway {
  readonly name = 'esewa' as const;
  constructor(
    readonly config: EsewaConfig,
    private readonly http: GatewayHttp,
  ) {}

  /** The fields of the form the student's browser posts to eSewa (signed here; the secret never leaves the API). */
  formFields(req: InitiateRequest): Record<string, string> {
    const total = esewaAmount(req.amountPaisa);
    const fields = {
      amount: total,
      tax_amount: '0',
      product_service_charge: '0',
      product_delivery_charge: '0',
      total_amount: total,
      transaction_uuid: req.paymentId,
      product_code: this.config.productCode,
      success_url: `${req.callbackBase}/api/v1/payments/esewa/return`,
      failure_url: `${req.callbackBase}/api/v1/payments/esewa/return?payment=${req.paymentId}`,
      signed_field_names: 'total_amount,transaction_uuid,product_code',
    };
    const message = `total_amount=${fields.total_amount},transaction_uuid=${fields.transaction_uuid},product_code=${fields.product_code}`;
    return { ...fields, signature: esewaSignature(message, this.config.secretKey) };
  }

  /**
   * The signed data eSewa sends back on success (base64 JSON). Returns the transaction id it names, or null when the
   * signature does not match (forged or altered). Even a valid one is confirmed with the status check before use.
   */
  readRedirect(data: string): { transactionUuid: string; payload: Record<string, unknown> } | null {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
    const fields =
      typeof payload['signed_field_names'] === 'string' ? payload['signed_field_names'].split(',') : [];
    const signature = typeof payload['signature'] === 'string' ? payload['signature'] : '';
    if (!fields.length || !signature || !fields.includes('transaction_uuid')) return null;
    const message = fields.map((f) => `${f}=${String(payload[f] ?? '')}`).join(',');
    if (!sameSignature(esewaSignature(message, this.config.secretKey), signature)) return null;
    return { transactionUuid: String(payload['transaction_uuid']), payload };
  }

  async check(paymentId: string, amountPaisa: number): Promise<GatewayVerdict> {
    const url = new URL(this.config.statusUrl);
    url.searchParams.set('product_code', this.config.productCode);
    url.searchParams.set('total_amount', esewaAmount(amountPaisa));
    url.searchParams.set('transaction_uuid', paymentId);
    const reply = await this.http.request('GET', url.toString());
    const body = (reply.body ?? {}) as Record<string, unknown>;
    if (reply.status >= 500) throw new GatewayError('eSewa status check failed', reply);
    const status = String(body['status'] ?? '');
    const amount = rupeesToPaisaLoose(body['total_amount']);
    const ref = typeof body['ref_id'] === 'string' && body['ref_id'] ? body['ref_id'] : null;
    switch (status) {
      case 'COMPLETE':
        return { status: 'completed', amountPaisa: amount, transactionId: ref, raw: body };
      case 'CANCELED':
        return { status: 'cancelled', amountPaisa: amount, transactionId: ref, raw: body };
      case 'NOT_FOUND':
        // Never paid (or not yet): it only becomes final when the order runs out of time.
        return { status: 'pending', amountPaisa: null, transactionId: null, raw: body };
      case 'FULL_REFUND':
      case 'PARTIAL_REFUND':
        return { status: 'failed', amountPaisa: amount, transactionId: ref, raw: body };
      default:
        // PENDING, AMBIGUOUS, or an answer we do not know: checked again later.
        return { status: 'pending', amountPaisa: amount, transactionId: ref, raw: body };
    }
  }

  /**
   * Configuration check: the status API answers for this product code (eSewa checks the secret key only when a
   * payment is made, so it cannot be tried here).
   */
  async probe(): Promise<{ ok: boolean; status: number }> {
    const url = new URL(this.config.statusUrl);
    url.searchParams.set('product_code', this.config.productCode);
    url.searchParams.set('total_amount', '1');
    url.searchParams.set('transaction_uuid', 'tk-config-check');
    const reply = await this.http.request('GET', url.toString());
    return { ok: reply.status < 500, status: reply.status };
  }
}

// ───────────── Khalti ─────────────

const KHALTI_URLS = {
  sandbox: 'https://dev.khalti.com/api/v2',
  production: 'https://khalti.com/api/v2',
} as const;

export interface KhaltiConfig {
  mode: 'sandbox' | 'production';
  secretKey: string;
  baseUrl: string;
}

export class KhaltiGateway {
  readonly name = 'khalti' as const;
  constructor(
    readonly config: KhaltiConfig,
    private readonly http: GatewayHttp,
  ) {}

  private headers() {
    return { Authorization: `Key ${this.config.secretKey}` };
  }

  /** Starts a payment at Khalti; returns its pidx and the page the student pays on. */
  async initiate(req: InitiateRequest): Promise<{ pidx: string; paymentUrl: string; raw: unknown }> {
    const reply = await this.http.request('POST', `${this.config.baseUrl}/epayment/initiate/`, {
      headers: this.headers(),
      json: {
        return_url: `${req.callbackBase}/api/v1/payments/khalti/return`,
        website_url: req.callbackBase,
        amount: req.amountPaisa,
        purchase_order_id: req.paymentId,
        purchase_order_name: req.orderName.slice(0, 100),
        customer_info: {
          name: req.customer.name,
          ...(req.customer.email ? { email: req.customer.email } : {}),
          ...(req.customer.phone ? { phone: req.customer.phone } : {}),
        },
      },
    });
    const body = (reply.body ?? {}) as Record<string, unknown>;
    if (reply.status !== 200 || typeof body['pidx'] !== 'string' || typeof body['payment_url'] !== 'string') {
      throw new GatewayError('Khalti could not start the payment', { status: reply.status, body });
    }
    return { pidx: body['pidx'], paymentUrl: body['payment_url'], raw: body };
  }

  async check(pidx: string): Promise<GatewayVerdict> {
    const reply = await this.http.request('POST', `${this.config.baseUrl}/epayment/lookup/`, {
      headers: this.headers(),
      json: { pidx },
    });
    const body = (reply.body ?? {}) as Record<string, unknown>;
    if (reply.status >= 500 || reply.status === 401) throw new GatewayError('Khalti lookup failed', reply);
    const status = String(body['status'] ?? '');
    const amount = typeof body['total_amount'] === 'number' ? body['total_amount'] : null;
    const txn =
      typeof body['transaction_id'] === 'string' && body['transaction_id'] ? body['transaction_id'] : null;
    switch (status) {
      case 'Completed':
        return { status: 'completed', amountPaisa: amount, transactionId: txn, raw: body };
      case 'User canceled':
        return { status: 'cancelled', amountPaisa: amount, transactionId: txn, raw: body };
      case 'Expired':
        return { status: 'expired', amountPaisa: amount, transactionId: txn, raw: body };
      case 'Refunded':
      case 'Partially Refunded':
        return { status: 'failed', amountPaisa: amount, transactionId: txn, raw: body };
      default:
        // Initiated, Pending, or not found yet: checked again later.
        return { status: 'pending', amountPaisa: amount, transactionId: txn, raw: body };
    }
  }

  /** Configuration check: the key is accepted (an unknown payment is "not found", a wrong key is 401). */
  async probe(): Promise<{ ok: boolean; status: number }> {
    const reply = await this.http.request('POST', `${this.config.baseUrl}/epayment/lookup/`, {
      headers: this.headers(),
      json: { pidx: 'tk-config-check' },
    });
    return { ok: reply.status !== 401 && reply.status !== 403 && reply.status < 500, status: reply.status };
  }
}

// ───────────── ConnectIPS (NCHL) ─────────────

/**
 * NCHL connectIPS e-Payment gateway (D-076), from NCHL's merchant integration guide: the student's browser posts a
 * form signed with the merchant's private key (SHA256withRSA over the fields, base64) to `/connectipswebgw/loginpage`;
 * NCHL sends the student back to the success / failure addresses registered for the merchant with `?TXNID=…`; the
 * payment is then confirmed server to server with `/connectipswebws/api/creditor/validatetxn` (Basic auth with the
 * application id and password, body signed the same way). Amounts are in paisa. Field names and formats are to be
 * confirmed against NCHL's current document in their UAT before going live.
 */
const CONNECTIPS_URLS = {
  sandbox: 'https://uat.connectips.com',
  production: 'https://login.connectips.com',
} as const;

export interface ConnectIpsConfig {
  mode: 'sandbox' | 'production';
  merchantId: string;
  appId: string;
  appName: string;
  appPassword: string;
  privateKey: KeyObject;
  baseUrl: string;
}

/**
 * The merchant's private key as configured: PEM text (line breaks as real newlines or `\n`), or the PEM file encoded
 * in base64 on one line. Throws when it is not a private key.
 */
export function readConnectIpsKey(value: string): KeyObject {
  const text = value.includes('BEGIN') ? value : Buffer.from(value, 'base64').toString('utf8');
  return createPrivateKey(text.replace(/\\n/g, '\n'));
}

/** dd-MM-yyyy in Nepal time, as the gateway expects TXNDATE. */
export function connectIpsDate(now: Date): string {
  const nepal = new Date(now.getTime() + (5 * 60 + 45) * 60_000);
  const dd = String(nepal.getUTCDate()).padStart(2, '0');
  const mm = String(nepal.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${nepal.getUTCFullYear()}`;
}

/** TXNID: at most 20 letters / digits; ours is the start of the payment id (time-ordered, unique per payment). */
export function connectIpsTxnId(paymentId: string): string {
  return paymentId.replace(/-/g, '').slice(0, 20);
}

export class ConnectIpsGateway {
  readonly name = 'connectips' as const;
  constructor(
    readonly config: ConnectIpsConfig,
    private readonly http: GatewayHttp,
  ) {}

  get formUrl(): string {
    return `${this.config.baseUrl}/connectipswebgw/loginpage`;
  }

  /** base64(SHA256withRSA(message)) with the merchant's key — the TOKEN NCHL checks with the merchant's certificate. */
  sign(message: string): string {
    return createSign('RSA-SHA256').update(message).sign(this.config.privateKey, 'base64');
  }

  /** The form the student's browser posts to NCHL (signed here; the key never leaves the API). */
  formFields(req: { txnId: string; amountPaisa: number; remarks: string; particulars: string; now: Date }) {
    const fields = {
      MERCHANTID: this.config.merchantId,
      APPID: this.config.appId,
      APPNAME: this.config.appName,
      TXNID: req.txnId,
      TXNDATE: connectIpsDate(req.now),
      TXNCRNCY: 'NPR',
      TXNAMT: String(req.amountPaisa),
      REFERENCEID: req.txnId,
      REMARKS: req.remarks.slice(0, 50),
      PARTICULARS: req.particulars.slice(0, 100),
    };
    const message = `${Object.entries(fields)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')},TOKEN=TOKEN`;
    return { ...fields, TOKEN: this.sign(message) };
  }

  /** The body NCHL's validation / detail APIs take for one transaction. */
  private validationBody(txnId: string, amountPaisa: number) {
    const message = `MERCHANTID=${this.config.merchantId},APPID=${this.config.appId},REFERENCEID=${txnId},TXNAMT=${amountPaisa}`;
    return {
      merchantId: Number.isNaN(Number(this.config.merchantId))
        ? this.config.merchantId
        : Number(this.config.merchantId),
      appId: this.config.appId,
      referenceId: txnId,
      txnAmt: amountPaisa,
      token: this.sign(message),
    };
  }

  private headers() {
    return {
      Authorization: `Basic ${Buffer.from(`${this.config.appId}:${this.config.appPassword}`).toString('base64')}`,
    };
  }

  /**
   * Confirms a payment with NCHL. Only `SUCCESS` for this transaction and amount completes it; anything else stays
   * pending (the student may still be paying) until the order's time is up.
   */
  async check(txnId: string, amountPaisa: number): Promise<GatewayVerdict> {
    const reply = await this.http.request(
      'POST',
      `${this.config.baseUrl}/connectipswebws/api/creditor/validatetxn`,
      { headers: this.headers(), json: this.validationBody(txnId, amountPaisa) },
    );
    if (reply.status >= 500 || reply.status === 401 || reply.status === 403) {
      throw new GatewayError('ConnectIPS validation failed', { status: reply.status, body: reply.body });
    }
    const body = (reply.body ?? {}) as Record<string, unknown>;
    const status = String(body['status'] ?? '').toUpperCase();
    const reported = Number(body['txnAmt']);
    const amount = Number.isFinite(reported) && reported > 0 ? Math.round(reported) : amountPaisa;
    if (status === 'SUCCESS' && String(body['referenceId'] ?? txnId) === txnId) {
      return { status: 'completed', amountPaisa: amount, transactionId: txnId, raw: body };
    }
    return { status: 'pending', amountPaisa: null, transactionId: null, raw: body };
  }

  /** Configuration check: NCHL accepts these credentials (an unknown transaction answers, it is not refused). */
  async probe(): Promise<{ ok: boolean; status: number }> {
    const reply = await this.http.request(
      'POST',
      `${this.config.baseUrl}/connectipswebws/api/creditor/gettxndetail`,
      { headers: this.headers(), json: this.validationBody('TKCONFIGCHECK', 100) },
    );
    return { ok: reply.status !== 401 && reply.status !== 403 && reply.status < 500, status: reply.status };
  }
}

// ───────────── Configuration ─────────────

/** The gateways configured in .env (null = not available). */
export function gatewaysFromEnv(env: Env, http: GatewayHttp) {
  const esewa =
    env.ESEWA_PRODUCT_CODE && env.ESEWA_SECRET_KEY
      ? new EsewaGateway(
          {
            mode: env.ESEWA_ENV,
            productCode: env.ESEWA_PRODUCT_CODE,
            secretKey: env.ESEWA_SECRET_KEY,
            formUrl: env.ESEWA_FORM_URL ?? ESEWA_URLS[env.ESEWA_ENV].form,
            statusUrl: env.ESEWA_STATUS_URL ?? ESEWA_URLS[env.ESEWA_ENV].status,
          },
          http,
        )
      : null;
  const khalti = env.KHALTI_SECRET_KEY
    ? new KhaltiGateway(
        {
          mode: env.KHALTI_ENV,
          secretKey: env.KHALTI_SECRET_KEY,
          baseUrl: (env.KHALTI_BASE_URL ?? KHALTI_URLS[env.KHALTI_ENV]).replace(/\/+$/, ''),
        },
        http,
      )
    : null;
  const connectips =
    env.CONNECTIPS_MERCHANT_ID &&
    env.CONNECTIPS_APP_ID &&
    env.CONNECTIPS_APP_NAME &&
    env.CONNECTIPS_APP_PASSWORD &&
    env.CONNECTIPS_PRIVATE_KEY
      ? new ConnectIpsGateway(
          {
            mode: env.CONNECTIPS_ENV,
            merchantId: env.CONNECTIPS_MERCHANT_ID,
            appId: env.CONNECTIPS_APP_ID,
            appName: env.CONNECTIPS_APP_NAME,
            appPassword: env.CONNECTIPS_APP_PASSWORD,
            privateKey: readConnectIpsKey(env.CONNECTIPS_PRIVATE_KEY),
            baseUrl: (env.CONNECTIPS_BASE_URL ?? CONNECTIPS_URLS[env.CONNECTIPS_ENV]).replace(/\/+$/, ''),
          },
          http,
        )
      : null;
  return { esewa, khalti, connectips };
}
