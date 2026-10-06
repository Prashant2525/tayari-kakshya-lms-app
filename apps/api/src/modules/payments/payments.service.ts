import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, type LocalizedText, type PayOrderInput, type Platform } from '@tk/contracts';
import { accessEndsAt, type AccessValidity } from '@tk/domain';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';
import { Prisma, type Order, type Payment, type PaymentProvider } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { activeEntitlementWhere, courseAccessEndsAt } from '../content/entitlements.service.js';
import { isLive } from '../content/publishing.js';
import { SettingsService } from '../settings/settings.service.js';
import { GatewayHttp } from './gateway-http.js';
import {
  GatewayError,
  gatewaysFromEnv,
  type EsewaGateway,
  type GatewayName,
  type GatewayVerdict,
  type KhaltiGateway,
} from './gateways.js';

const notAvailable = (
  reason: 'channel_closed' | 'already_has_access' | 'free_course' | 'not_for_sale' | 'access_period_ended',
  message: string,
) => new AppError(409, ErrorCode.PURCHASE_NOT_AVAILABLE, message, { reason });
const orderClosed = () => new AppError(409, ErrorCode.ORDER_CLOSED, 'This order can no longer be paid');
const providerUnavailable = () =>
  new AppError(409, ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE, 'This payment method is not available');
const gatewayError = () =>
  new AppError(
    502,
    ErrorCode.PAYMENT_GATEWAY_ERROR,
    'The payment service could not be reached. Please try again in a moment.',
  );

const OPEN: Payment['status'][] = ['initiated', 'pending'];
/** A payment the student just came back from is checked again at most this often when its order is viewed. */
const VIEW_CHECK_MS = 5_000;
/** After the order's time is up, a payment the gateway never saw is closed after this grace. */
const ABANDONED_GRACE_MS = 30 * 60_000;

type ValiditySnapshot = {
  type: 'days' | 'fixed_date' | 'lifetime';
  days: number | null;
  endsOn: string | null;
};

/** Removes anything secret-looking from a gateway payload before it is stored. */
function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        /secret|password|token|authorization/i.test(k) ? '[removed]' : stripSecrets(v),
      ]),
    );
  }
  return value;
}

/**
 * Where gateways send the student back: the configured public address — except in development, where it is the
 * address the device itself used (http://10.0.2.2:4000 from the Android emulator, the computer's network address from
 * a phone), because "localhost" in the configuration means the device itself there.
 */
export function resolveCallbackBase(
  env: Pick<Env, 'APP_ENV' | 'PAYMENT_CALLBACK_BASE_URL'>,
  requestOrigin: string | null,
): string | undefined {
  if (env.APP_ENV === 'development' && requestOrigin && /^https?:\/\/[\w.-]+(:\d+)?$/.test(requestOrigin)) {
    return requestOrigin;
  }
  return env.PAYMENT_CALLBACK_BASE_URL?.replace(/\/+$/, '');
}

/**
 * The app's return link when allowed — the configured one (`tayarikakshya://payment-result`), or Expo Go's
 * (`exp://<host>/--/payment-result`) in development — otherwise the configured one. Never an arbitrary address.
 */
export function resolveAppReturnUrl(
  env: Pick<Env, 'APP_ENV' | 'PAYMENT_RETURN_URL_APP'>,
  requested: string | undefined,
): string {
  const configured = env.PAYMENT_RETURN_URL_APP;
  if (!requested || requested === configured) return configured;
  const expoGo = /^exps?:\/\/[\w.-]+(:\d+)?\/--\/payment-result$/;
  if (env.APP_ENV === 'development' && expoGo.test(requested)) return requested;
  return configured;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Course purchases (Phase 11 part 1, T-049). The server fixes the price when the order is created; a payment is only
 * ever marked paid after the server has verified it with the gateway (never from what the student's browser says),
 * and that happens in one place (`settle`) under a lock per order, so duplicate or late callbacks, the reconciliation
 * worker and the student returning all agree. A paid order grants access once (unique index), with the validity the
 * course had when it was bought. Every gateway message is kept (`payment_events`); financial rows are never deleted.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly gateways: { esewa: EsewaGateway | null; khalti: KhaltiGateway | null };

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    http: GatewayHttp,
  ) {
    this.gateways = gatewaysFromEnv(env, http);
  }

  // ───────────── Checkout ─────────────

  /** Gateways a student can pay with now (configured in .env and switched on in the CMS). */
  async options(platform: Platform) {
    const enabled = await this.settings.get('payments.providers');
    const canBuy = await this.channelOpen(platform);
    const providers = (['esewa', 'khalti'] as const)
      .filter((p) => canBuy && enabled[p] && this.gateways[p] && this.env.PAYMENT_CALLBACK_BASE_URL)
      .map((p) => ({ provider: p, testMode: this.gateways[p]!.config.mode === 'sandbox' }));
    return { providers };
  }

  /**
   * Creates the order for a course at its current price (sale included), or returns the student's unpaid one for it.
   * Refused while the student has access (D-052), for free courses (they enrol), and where the platform cannot sell
   * (D-027: never on iOS).
   */
  async createOrder(userId: string, courseId: string, platform: Platform, now = new Date()) {
    if (!(await this.channelOpen(platform))) {
      throw notAvailable('channel_closed', 'Purchases are not available here');
    }
    const order = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${userId}:${courseId}`}))`;
      const course = await tx.course.findFirst({ where: { id: courseId, deletedAt: null } });
      if (!course || !isLive(course, now)) throw Errors.notFound('Course');
      if (course.pricePaisa === 0) throw notAvailable('free_course', 'This course is free: enrol instead');
      const endsAt = courseAccessEndsAt(course, now);
      if (endsAt && endsAt <= now) {
        throw notAvailable('access_period_ended', 'This course can no longer be bought');
      }
      const active = await tx.entitlement.findFirst({
        where: { userId, courseId, ...activeEntitlementWhere(now) },
      });
      if (active) throw notAvailable('already_has_access', 'You already have access to this course');

      const saleActive =
        course.salePricePaisa !== null &&
        (!course.saleStartsAt || course.saleStartsAt <= now) &&
        (!course.saleEndsAt || course.saleEndsAt > now);
      const price = saleActive ? (course.salePricePaisa as number) : course.pricePaisa;
      if (price <= 0) throw notAvailable('not_for_sale', 'This course is not for sale');

      // The student's unpaid order for this course at this price is reused (several taps, or two devices).
      const open = await tx.order.findFirst({
        where: {
          userId,
          status: 'pending',
          expiresAt: { gt: now },
          items: { some: { courseId } },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (open && open.totalPaisa === price) return open;
      if (open) await tx.order.update({ where: { id: open.id }, data: { status: 'cancelled' } });

      const validity: ValiditySnapshot = {
        type: course.validityType,
        days: course.validityDays,
        endsOn: course.validityEndsOn?.toISOString().slice(0, 10) ?? null,
      };
      return tx.order.create({
        data: {
          userId,
          channel: platform,
          subtotalPaisa: price,
          totalPaisa: price,
          expiresAt: new Date(now.getTime() + this.env.PAYMENT_ORDER_TTL_MINUTES * 60_000),
          items: {
            create: {
              itemType: 'course',
              courseId,
              titleSnapshot: course.title as Prisma.InputJsonValue,
              unitPricePaisa: price,
              validitySnapshot: validity as unknown as Prisma.InputJsonValue,
            },
          },
        },
      });
    });
    return this.orderView(order.id, userId);
  }

  /**
   * Starts paying an order with a gateway; returns where to send the student. `requestOrigin` is how the device
   * reached the API (used as the callback address in development only).
   */
  async pay(
    orderId: string,
    input: PayOrderInput,
    userId: string,
    requestOrigin: string | null = null,
    now = new Date(),
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true, user: true },
    });
    if (!order) throw Errors.notFound('Order');
    if (order.status !== 'pending' || order.expiresAt <= now) throw orderClosed();
    const enabled = await this.settings.get('payments.providers');
    const callbackBase = resolveCallbackBase(this.env, requestOrigin);
    if (!enabled[input.provider] || !this.gateways[input.provider] || !callbackBase)
      throw providerUnavailable();
    if (input.returnTo === 'web' && !this.env.PAYMENT_RETURN_URL_WEB) {
      throw Errors.validation([{ path: 'returnTo', message: 'Paying from the website is not set up' }]);
    }
    const returnTo =
      input.returnTo === 'web'
        ? this.env.PAYMENT_RETURN_URL_WEB!
        : resolveAppReturnUrl(this.env, input.appReturnUrl);

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        provider: input.provider,
        amountPaisa: order.totalPaisa,
        returnTo,
        callbackBase,
      },
    });
    const title = order.items[0]?.titleSnapshot as LocalizedText | undefined;
    const request = {
      paymentId: payment.id,
      amountPaisa: order.totalPaisa,
      orderName: `#${order.orderNo} ${title?.en ?? title?.ne ?? ''}`.trim(),
      customer: { name: order.user.fullName, email: order.user.email, phone: order.user.phone },
      callbackBase,
    };

    if (input.provider === 'esewa') {
      // The student's browser posts a form we sign (the secret stays here): our page builds and sends it.
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerReference: payment.id },
      });
      return {
        paymentId: payment.id,
        redirectUrl: `${callbackBase}/api/v1/payments/esewa/${payment.id}/start`,
      };
    }
    try {
      const started = await this.gateways.khalti!.initiate(request);
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerReference: started.pidx },
      });
      await this.event(this.prisma, payment.id, 'khalti', 'initiate', started.raw, 'initiated');
      return { paymentId: payment.id, redirectUrl: started.paymentUrl };
    } catch (err) {
      const detail = err instanceof GatewayError ? err.detail : String(err);
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', failureReason: 'initiate_failed' },
      });
      await this.event(this.prisma, payment.id, 'khalti', 'initiate', detail, 'initiate_failed');
      this.logger.warn({ paymentId: payment.id }, 'Khalti could not start a payment');
      throw gatewayError();
    }
  }

  /** The page that posts the signed form to eSewa (public: the browser opens it without the student's token). */
  async esewaStartPage(
    paymentId: string,
    now = new Date(),
  ): Promise<{ html: string; formAction: string } | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { items: true, user: true } } },
    });
    const gateway = this.gateways.esewa;
    if (
      !payment ||
      !gateway ||
      payment.provider !== 'esewa' ||
      payment.status !== 'initiated' ||
      payment.order.status !== 'pending' ||
      payment.order.expiresAt <= now
    ) {
      return null;
    }
    const fields = gateway.formFields({
      paymentId: payment.id,
      amountPaisa: payment.amountPaisa,
      orderName: `#${payment.order.orderNo}`,
      customer: { name: payment.order.user.fullName, email: null, phone: null },
      callbackBase: payment.callbackBase ?? this.env.PAYMENT_CALLBACK_BASE_URL!.replace(/\/+$/, ''),
    });
    const inputs = Object.entries(fields)
      .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>eSewa</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px 16px"><form id="pay" method="POST" action="${escapeHtml(gateway.config.formUrl)}">${inputs}<p>Opening eSewa…</p><button type="submit">Continue to eSewa</button></form><script>document.getElementById('pay').submit();</script></body></html>`;
    return { html, formAction: new URL(gateway.config.formUrl).origin };
  }

  // ───────────── Returns from the gateways ─────────────

  /**
   * eSewa sends the student back with signed data (success) or to our failure address. Neither is trusted on its
   * own: the payment is confirmed with eSewa's status check. Returns where to send the student next.
   */
  async esewaReturn(query: { data?: string; payment?: string }): Promise<string | null> {
    const gateway = this.gateways.esewa;
    if (!gateway) return null;
    let paymentId = query.payment ?? null;
    if (query.data) {
      const read = gateway.readRedirect(query.data);
      if (!read) {
        await this.event(this.prisma, null, 'esewa', 'redirect', { data: query.data }, 'rejected_signature');
        return null;
      }
      paymentId = read.transactionUuid;
    }
    const payment =
      paymentId && /^[0-9a-f-]{36}$/i.test(paymentId)
        ? await this.prisma.payment.findUnique({ where: { id: paymentId } })
        : null;
    if (!payment || payment.provider !== 'esewa') return null;
    await this.check(payment, 'redirect', query);
    return this.returnUrl(payment);
  }

  /** Khalti sends the student back with the pidx; the payment is confirmed with Khalti's lookup. */
  async khaltiReturn(query: { pidx?: string }): Promise<string | null> {
    if (!query.pidx || !this.gateways.khalti) return null;
    const payment = await this.prisma.payment.findUnique({
      where: { provider_providerReference: { provider: 'khalti', providerReference: query.pidx } },
    });
    if (!payment) {
      await this.event(this.prisma, null, 'khalti', 'redirect', query, 'unknown_payment');
      return null;
    }
    await this.check(payment, 'redirect', query);
    return this.returnUrl(payment);
  }

  // ───────────── Orders ─────────────

  /** The student's order; an unsettled payment is checked with its gateway first (they may have just paid). */
  async orderView(orderId: string, userId: string, now = new Date()) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw Errors.notFound('Order');
    if (order.status === 'pending') {
      const open = await this.prisma.payment.findFirst({
        where: { orderId, status: { in: OPEN } },
        orderBy: { initiatedAt: 'desc' },
      });
      const recent = open?.lastCheckedAt && now.getTime() - open.lastCheckedAt.getTime() < VIEW_CHECK_MS;
      if (open && !recent) await this.check(open, 'verify', null).catch(() => undefined);
    }
    const full = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: { include: { course: { select: { id: true, slug: true } } } },
        payments: { orderBy: { initiatedAt: 'desc' } },
      },
    });
    return this.view(full);
  }

  async myOrders(userId: string) {
    const rows = await this.prisma.order.findMany({
      where: { userId, OR: [{ status: 'paid' }, { payments: { some: {} } }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        items: { include: { course: { select: { id: true, slug: true } } } },
        payments: { orderBy: { initiatedAt: 'desc' } },
      },
    });
    return rows.map((o) => this.view(o));
  }

  // ───────────── Settling ─────────────

  /** Asks the payment's gateway where it stands and settles it. */
  async check(payment: Payment, eventType: 'redirect' | 'verify' | 'reconcile' | 'staff', payload: unknown) {
    const gateway = payment.provider === 'esewa' ? this.gateways.esewa : this.gateways.khalti;
    if (!gateway || (payment.provider === 'khalti' && !payment.providerReference)) return payment;
    let verdict: GatewayVerdict;
    try {
      verdict =
        payment.provider === 'esewa'
          ? await this.gateways.esewa!.check(payment.id, payment.amountPaisa)
          : await this.gateways.khalti!.check(payment.providerReference!);
    } catch (err) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { lastCheckedAt: new Date(), checkCount: { increment: 1 } },
      });
      await this.event(
        this.prisma,
        payment.id,
        payment.provider,
        eventType,
        {
          request: payload,
          error: err instanceof GatewayError ? err.detail : String(err),
        },
        'gateway_unreachable',
      );
      throw err;
    }
    return this.settle(payment.id, verdict, eventType, payload);
  }

  /**
   * The only place a payment's outcome is recorded (idempotent; one at a time per order). Completed needs the
   * gateway's confirmation of the exact amount; a second completed payment for a paid order is kept and flagged.
   */
  async settle(
    paymentId: string,
    verdict: GatewayVerdict,
    eventType: string,
    request: unknown,
    now = new Date(),
  ): Promise<Payment> {
    return this.prisma.$transaction(async (tx) => {
      const first = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pay:${first.orderId}`}))`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const touch = { lastCheckedAt: now, checkCount: { increment: 1 } };
      const record = (result: string) =>
        this.event(tx, payment.id, payment.provider, eventType, { request, gateway: verdict.raw }, result);

      if (payment.status === 'completed') {
        await tx.payment.update({ where: { id: payment.id }, data: touch });
        await record('unchanged');
        return payment;
      }

      if (verdict.status === 'completed') {
        if (verdict.amountPaisa !== payment.amountPaisa) {
          // Money moved, but not the amount of this order: never grants access; staff decide.
          const updated = await tx.payment.update({
            where: { id: payment.id },
            data: { ...touch, status: 'failed', failureReason: 'amount_mismatch' },
          });
          await record('rejected_amount');
          await this.audit.record(
            {
              actorUserId: null,
              action: 'payment.amount_mismatch',
              entityType: 'payment',
              entityId: payment.id,
              changes: { expected: payment.amountPaisa, reported: verdict.amountPaisa },
            },
            tx,
          );
          return updated;
        }
        const order = await tx.order.findUniqueOrThrow({
          where: { id: payment.orderId },
          include: { items: true },
        });
        const duplicate = order.status === 'paid';
        const updated = await tx.payment.update({
          where: { id: payment.id },
          data: {
            ...touch,
            status: 'completed',
            completedAt: now,
            providerTransactionId: verdict.transactionId,
            duplicate,
            failureReason: null,
          },
        });
        if (duplicate) {
          await record('duplicate');
          await this.audit.record(
            {
              actorUserId: null,
              action: 'payment.duplicate',
              entityType: 'payment',
              entityId: payment.id,
              changes: { orderId: order.id, amountPaisa: payment.amountPaisa },
            },
            tx,
          );
          return updated;
        }
        await tx.order.update({ where: { id: order.id }, data: { status: 'paid', paidAt: now } });
        for (const item of order.items) {
          if (item.itemType !== 'course' || !item.courseId) continue;
          const snapshot = item.validitySnapshot as unknown as ValiditySnapshot;
          const validity: AccessValidity =
            snapshot.type === 'days'
              ? { type: 'days', days: snapshot.days ?? 0 }
              : snapshot.type === 'fixed_date'
                ? { type: 'fixed_date', endsOn: snapshot.endsOn ?? '' }
                : { type: 'lifetime' };
          await tx.entitlement.create({
            data: {
              userId: order.userId,
              scopeType: 'course',
              courseId: item.courseId,
              sourceType: 'order',
              sourceId: order.id,
              startsAt: now,
              endsAt: accessEndsAt(validity, now),
            },
          });
        }
        await record('completed');
        await this.audit.record(
          {
            actorUserId: null,
            action: 'order.paid',
            entityType: 'order',
            entityId: order.id,
            changes: {
              orderNo: order.orderNo,
              paymentId: payment.id,
              provider: payment.provider,
              amountPaisa: payment.amountPaisa,
              transactionId: verdict.transactionId,
            },
          },
          tx,
        );
        return updated;
      }

      if (verdict.status === 'pending') {
        const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
        // The gateway never saw a payment, long after the order's time was up: the attempt is over.
        const abandoned = now.getTime() > order.expiresAt.getTime() + ABANDONED_GRACE_MS;
        const updated = await tx.payment.update({
          where: { id: payment.id },
          data: abandoned
            ? { ...touch, status: 'expired', failureReason: 'not_paid_in_time' }
            : { ...touch, status: 'pending' },
        });
        await record(abandoned ? 'expired' : 'pending');
        return updated;
      }

      // failed / cancelled / expired: final for this attempt (the student can try again while the order is open).
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: { ...touch, status: verdict.status, failureReason: verdict.status },
      });
      await record(verdict.status);
      return updated;
    });
  }

  /**
   * Worker: checks payments still open with their gateway (the student may have paid and never come back), and closes
   * orders whose time is up with nothing left to settle. Returns what changed.
   */
  async reconcile(now = new Date()) {
    const due = await this.prisma.payment.findMany({
      where: {
        status: { in: OPEN },
        initiatedAt: { lt: new Date(now.getTime() - 60_000), gt: new Date(now.getTime() - 48 * 3_600_000) },
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - 60_000) } }],
      },
      orderBy: { initiatedAt: 'asc' },
      take: 50,
    });
    let settled = 0;
    for (const p of due) {
      const after = await this.check(p, 'reconcile', null).catch(() => p);
      if (!OPEN.includes(after.status)) settled += 1;
    }
    const expired = await this.prisma.order.updateMany({
      where: { status: 'pending', expiresAt: { lt: now }, payments: { none: { status: { in: OPEN } } } },
      data: { status: 'expired' },
    });
    return { checked: due.length, settled, expiredOrders: expired.count };
  }

  // ───────────── helpers ─────────────

  private async channelOpen(platform: Platform): Promise<boolean> {
    const channels = await this.settings.get('purchase.channels');
    if (platform === 'ios') return false;
    if (platform === 'android') return channels.android === 'in_app';
    return channels.web === 'enabled';
  }

  private returnUrl(payment: Payment): string | null {
    const base =
      payment.returnTo === 'web'
        ? this.env.PAYMENT_RETURN_URL_WEB
        : payment.returnTo === 'app'
          ? this.env.PAYMENT_RETURN_URL_APP
          : payment.returnTo;
    if (!base) return null;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}order=${payment.orderId}`;
  }

  private event(
    db: Tx | PrismaService,
    paymentId: string | null,
    provider: PaymentProvider | GatewayName,
    eventType: string,
    payload: unknown,
    result: string,
  ) {
    return db.paymentEvent.create({
      data: {
        paymentId,
        provider,
        eventType,
        payload: (stripSecrets(payload ?? {}) ?? {}) as Prisma.InputJsonValue,
        result,
      },
    });
  }

  private view(
    o: Order & {
      items: Array<{
        courseId: string | null;
        titleSnapshot: unknown;
        unitPricePaisa: number;
        course: { id: string; slug: string } | null;
      }>;
      payments: Payment[];
    },
  ) {
    return {
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      currency: o.currency,
      totalPaisa: o.totalPaisa,
      createdAt: o.createdAt.toISOString(),
      expiresAt: o.expiresAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? null,
      items: o.items.map((i) => ({
        courseId: i.courseId,
        slug: i.course?.slug ?? null,
        title: i.titleSnapshot as LocalizedText,
        pricePaisa: i.unitPricePaisa,
      })),
      payments: o.payments.map((p) => ({
        id: p.id,
        provider: p.provider,
        status: p.status,
        initiatedAt: p.initiatedAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
      })),
    };
  }
}
