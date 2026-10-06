// Stand-in for eSewa ePay v2 and Khalti KPG-2 in browser E2E runs (test-only; never used by the product). It speaks
// the same endpoints the API calls — Khalti initiate/lookup, eSewa form/status — and shows a small payment page with
// Pay and Cancel, redirecting back with correctly signed data, so the whole checkout runs without real gateways.
import { createHmac } from 'node:crypto';
import http from 'node:http';

export const E2E_ESEWA_SECRET = 'e2e-esewa-secret';
export const E2E_KHALTI_KEY = 'e2e-khalti-key';

const page = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;padding:32px 16px;text-align:center">${body}</body></html>`;

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });

/** @param {number} port */
export function startFakeGateway(port) {
  const khalti = new Map();
  const esewa = new Map();
  let seq = 0;
  const base = `http://localhost:${port}`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', base);
    const send = (status, type, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': type, ...headers });
      res.end(body);
    };
    const json = (status, body) => send(status, 'application/json', JSON.stringify(body));

    // ── Khalti ──
    if (req.method === 'POST' && url.pathname === '/khalti/api/v2/epayment/initiate/') {
      if (req.headers.authorization !== `Key ${E2E_KHALTI_KEY}`)
        return json(401, { detail: 'Invalid token.' });
      const b = JSON.parse(await readBody(req));
      const pidx = `e2e-pidx-${++seq}`;
      khalti.set(pidx, { ...b, status: 'Initiated', transaction_id: null });
      return json(200, { pidx, payment_url: `${base}/khalti/pay?pidx=${pidx}`, expires_at: '' });
    }
    if (req.method === 'POST' && url.pathname === '/khalti/api/v2/epayment/lookup/') {
      if (req.headers.authorization !== `Key ${E2E_KHALTI_KEY}`)
        return json(401, { detail: 'Invalid token.' });
      const { pidx } = JSON.parse(await readBody(req));
      const p = khalti.get(pidx);
      if (!p) return json(404, { detail: 'Not found.' });
      return json(200, { pidx, status: p.status, total_amount: p.amount, transaction_id: p.transaction_id });
    }
    if (req.method === 'GET' && url.pathname === '/khalti/pay') {
      const pidx = url.searchParams.get('pidx');
      const p = khalti.get(pidx);
      if (!p) return send(404, 'text/html', page('Khalti', 'Unknown payment'));
      return send(
        200,
        'text/html',
        page(
          'Khalti test payment',
          `<h1>Khalti (E2E stand-in)</h1><p>${p.purchase_order_name}</p><p>Rs ${p.amount / 100}</p><p><a href="/khalti/pay/confirm?pidx=${pidx}&action=pay">Pay with Khalti</a></p><p><a href="/khalti/pay/confirm?pidx=${pidx}&action=cancel">Cancel payment</a></p>`,
        ),
      );
    }
    if (req.method === 'GET' && url.pathname === '/khalti/pay/confirm') {
      const pidx = url.searchParams.get('pidx');
      const p = khalti.get(pidx);
      if (!p) return send(404, 'text/html', page('Khalti', 'Unknown payment'));
      const paid = url.searchParams.get('action') === 'pay';
      p.status = paid ? 'Completed' : 'User canceled';
      p.transaction_id = paid ? `E2E-KTX-${pidx}` : null;
      const back = new URL(p.return_url);
      back.search = new URLSearchParams({
        pidx,
        status: p.status,
        purchase_order_id: p.purchase_order_id,
        amount: String(p.amount),
      }).toString();
      return send(302, 'text/plain', '', { Location: back.toString() });
    }

    // ── eSewa ──
    if (req.method === 'POST' && url.pathname === '/esewa/form') {
      const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
      const message = `total_amount=${f.total_amount},transaction_uuid=${f.transaction_uuid},product_code=${f.product_code}`;
      const expected = createHmac('sha256', E2E_ESEWA_SECRET).update(message).digest('base64');
      if (expected !== f.signature)
        return json(400, { code: 'ES104', message: 'Invalid payload signature.' });
      esewa.set(f.transaction_uuid, { ...f, status: 'PENDING' });
      return send(
        200,
        'text/html',
        page(
          'eSewa test payment',
          `<h1>eSewa (E2E stand-in)</h1><p>Rs ${f.total_amount}</p><p><a href="/esewa/confirm?uuid=${f.transaction_uuid}&action=pay">Pay with eSewa</a></p><p><a href="/esewa/confirm?uuid=${f.transaction_uuid}&action=cancel">Cancel payment</a></p>`,
        ),
      );
    }
    if (req.method === 'GET' && url.pathname === '/esewa/confirm') {
      const t = esewa.get(url.searchParams.get('uuid'));
      if (!t) return send(404, 'text/html', page('eSewa', 'Unknown payment'));
      if (url.searchParams.get('action') !== 'pay') {
        t.status = 'CANCELED';
        return send(302, 'text/plain', '', { Location: t.failure_url });
      }
      t.status = 'COMPLETE';
      const payload = {
        transaction_code: `E2E${t.transaction_uuid.slice(-4)}`,
        status: 'COMPLETE',
        total_amount: Number(t.total_amount).toFixed(1),
        transaction_uuid: t.transaction_uuid,
        product_code: t.product_code,
        signed_field_names:
          'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
      };
      const message = payload.signed_field_names
        .split(',')
        .map((k) => `${k}=${payload[k]}`)
        .join(',');
      payload.signature = createHmac('sha256', E2E_ESEWA_SECRET).update(message).digest('base64');
      const data = Buffer.from(JSON.stringify(payload)).toString('base64');
      const sep = t.success_url.includes('?') ? '&' : '?';
      return send(302, 'text/plain', '', {
        Location: `${t.success_url}${sep}data=${encodeURIComponent(data)}`,
      });
    }
    if (req.method === 'GET' && url.pathname === '/esewa/status') {
      const uuid = url.searchParams.get('transaction_uuid');
      const t = esewa.get(uuid);
      return json(200, {
        product_code: url.searchParams.get('product_code'),
        transaction_uuid: uuid,
        total_amount: t ? Number(t.total_amount) : 0,
        status: t ? t.status : 'NOT_FOUND',
        ref_id: t && t.status === 'COMPLETE' ? `E2E-REF-${uuid.slice(-4)}` : null,
      });
    }
    return send(404, 'text/plain', 'not found');
  });
  server.listen(port);
  return server;
}

/** The API's gateway settings for an E2E run against the stand-in. */
export function fakeGatewayEnv(port, { callbackBase, webReturnUrl }) {
  const base = `http://localhost:${port}`;
  return {
    ESEWA_ENV: 'sandbox',
    ESEWA_PRODUCT_CODE: 'EPAYTEST',
    ESEWA_SECRET_KEY: E2E_ESEWA_SECRET,
    ESEWA_FORM_URL: `${base}/esewa/form`,
    ESEWA_STATUS_URL: `${base}/esewa/status`,
    KHALTI_ENV: 'sandbox',
    KHALTI_SECRET_KEY: E2E_KHALTI_KEY,
    KHALTI_BASE_URL: `${base}/khalti/api/v2`,
    PAYMENT_CALLBACK_BASE_URL: callbackBase,
    PAYMENT_RETURN_URL_WEB: webReturnUrl,
    PAYMENT_RETURN_URL_APP: 'tayarikakshya://payment-result',
    E2E_GATEWAY_PORT: String(port),
  };
}
