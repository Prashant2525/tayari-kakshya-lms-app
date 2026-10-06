import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateOrderInput, OrderQuoteInput, PayOrderInput, type Platform } from '@tk/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Audiences, CurrentAuth, Public, type AuthContext } from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { ClientPlatform } from '../content/request-helpers.js';
import { PaymentsService } from './payments.service.js';

const uuid = () => new ParseUUIDPipe();

/** Shown when a gateway sends the student to an address we cannot route back (unknown or forged payment). */
const LOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px 16px"><p>We could not match this payment. If money was taken, it will appear in your orders once it is confirmed; you can close this page.</p></body></html>`;

/** Course purchases for students (Phase 11, T-049). */
@ApiTags('payments')
@ApiBearerAuth()
@Audiences('student')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payments/options')
  options(@ClientPlatform() platform: Platform) {
    return this.payments.options(platform);
  }

  @Post('orders')
  @RateLimit({ name: 'orders.create', limit: 60, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(CreateOrderInput)
  createOrder(
    @ZodBody(CreateOrderInput) body: CreateOrderInput,
    @ClientPlatform() platform: Platform,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.payments.createOrder(auth.userId, body, platform);
  }

  /** The price checkout would charge (sale, coupon, VAT) — nothing is stored. */
  @Post('orders/quote')
  @HttpCode(200)
  @RateLimit({ name: 'orders.quote', limit: 120, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(OrderQuoteInput)
  quote(
    @ZodBody(OrderQuoteInput) body: OrderQuoteInput,
    @ClientPlatform() platform: Platform,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.payments.quote(auth.userId, body, platform);
  }

  @Post('orders/:id/pay')
  @HttpCode(200)
  @RateLimit({ name: 'orders.pay', limit: 30, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(PayOrderInput)
  pay(
    @Param('id', uuid()) id: string,
    @ZodBody(PayOrderInput) body: PayOrderInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: FastifyRequest,
  ) {
    const host = req.headers.host;
    return this.payments.pay(id, body, auth.userId, host ? `${req.protocol}://${host}` : null);
  }

  /** The order (an unsettled payment is checked with its gateway first). Polled by the app after paying. */
  @Get('orders/:id')
  @RateLimit({ name: 'orders.view', limit: 600, windowSeconds: 3600, by: ['user'] })
  order(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.payments.orderView(id, auth.userId);
  }

  @Get('me/orders')
  mine(@CurrentAuth() auth: AuthContext) {
    return this.payments.myOrders(auth.userId);
  }

  // ───────────── Gateway pages and returns (public: the browser comes back without the student's token) ─────────────

  @Public()
  @Get('payments/esewa/:paymentId/start')
  @RateLimit({ name: 'payments.esewa.start', limit: 60, windowSeconds: 3600, by: ['ip'] })
  async esewaStart(@Param('paymentId', uuid()) paymentId: string, @Res() reply: FastifyReply) {
    const page = await this.payments.esewaStartPage(paymentId);
    if (!page) {
      void reply.status(404).type('text/html; charset=utf-8').send(LOST_PAGE);
      return;
    }
    void reply
      .header(
        'Content-Security-Policy',
        [
          "default-src 'none'",
          // Only the one-line script that sends the form (its hash), and the form only to eSewa.
          "script-src 'sha256-cXN4kc0BnyUGmltBTHDFqlgGIBTcF/hDhdn58LICFNQ='",
          `form-action ${page.formAction}`,
          "base-uri 'none'",
          "frame-ancestors 'none'",
        ].join('; '),
      )
      .header('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(page.html);
  }

  @Public()
  @Get('payments/esewa/return')
  @RateLimit({ name: 'payments.return', limit: 120, windowSeconds: 3600, by: ['ip'] })
  async esewaReturn(@Query() query: Record<string, string>, @Res() reply: FastifyReply) {
    const next = await this.payments
      .esewaReturn({ data: query['data'], payment: query['payment'] })
      .catch(() => null);
    this.redirect(reply, next);
  }

  @Public()
  @Get('payments/khalti/return')
  @RateLimit({ name: 'payments.return', limit: 120, windowSeconds: 3600, by: ['ip'] })
  async khaltiReturn(@Query() query: Record<string, string>, @Res() reply: FastifyReply) {
    const next = await this.payments.khaltiReturn({ pidx: query['pidx'] }).catch(() => null);
    this.redirect(reply, next);
  }

  private redirect(reply: FastifyReply, next: string | null) {
    if (next) {
      void reply.header('Cache-Control', 'no-store').redirect(next, 302);
      return;
    }
    void reply.status(400).type('text/html; charset=utf-8').send(LOST_PAGE);
  }
}
