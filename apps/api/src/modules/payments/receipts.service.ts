import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LocalizedText } from '@tk/contracts';
import { fiscalYearOf, formatNpr, instantToBs } from '@tk/domain';
import { Errors } from '../../common/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';
import { Prisma, type Invoice } from '../../generated/prisma/client.js';
import { MailService } from '../../infra/messaging/mail.service.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { renderReceiptPdf, type ReceiptContent } from './receipt-pdf.js';

/** How long a receipt download link works. */
const LINK_SECONDS = 600;
/** A receipt email is tried this many times, at least this far apart. */
const EMAIL_ATTEMPTS = 5;
const EMAIL_RETRY_MS = 5 * 60_000;

const EMAIL_TEXT = {
  en: {
    subject: (no: string) => `Your receipt ${no}`,
    body: (name: string, no: string, order: string, total: string) =>
      `Hello ${name},\n\nYour payment is confirmed. Your receipt ${no} for order ${order} (${total}) is attached.\n\nYou can also download it in the app: Profile → Purchases.`,
  },
  ne: {
    subject: (no: string) => `तपाईंको रसिद ${no}`,
    body: (name: string, no: string, order: string, total: string) =>
      `नमस्ते ${name},\n\nतपाईंको भुक्तानी पुष्टि भयो। अर्डर ${order} (${total}) को रसिद ${no} संलग्न छ।\n\nएपमा पनि डाउनलोड गर्न सकिन्छ: प्रोफाइल → खरिदहरू।`,
  },
} as const;

/**
 * Receipts (D-026, D-057): one per paid order, numbered in order (prefix + Nepali fiscal year + running number, from
 * the CMS setting `commerce.receipts`) inside the payment's own transaction, with a snapshot of everything printed.
 * Students download the PDF through a short-lived signed link and get it by email once payment is confirmed.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);
  private readonly linkKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    @Inject(ENV) env: Env,
  ) {
    this.linkKey = Buffer.from(hkdfSync('sha256', env.ENCRYPTION_KEY, '', 'tk receipt link v1', 32));
  }

  /** Issues the receipt for an order that has just been paid (call inside that transaction). */
  async issue(tx: Tx, orderId: string, paidWith: string | null, now: Date): Promise<Invoice> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, user: { select: { fullName: true, email: true, phone: true } } },
    });
    const [tax, numbering] = await Promise.all([
      this.settings.get('commerce.tax'),
      this.settings.get('commerce.receipts'),
    ]);
    const fiscalYear = numbering.resetEachFiscalYear ? fiscalYearOf(instantToBs(now)) : null;
    // One row per fiscal year, incremented under its row lock: numbers never repeat or skip within a year.
    const counted = await tx.$queryRaw<Array<{ next_value: number }>>`
      INSERT INTO invoice_counters (key, next_value) VALUES (${fiscalYear ?? 'all'}, 1)
      ON CONFLICT (key) DO UPDATE SET next_value = invoice_counters.next_value + 1
      RETURNING next_value`;
    const sequence = counted[0]!.next_value;
    const invoiceNo = [numbering.prefix, fiscalYear, String(sequence).padStart(6, '0')]
      .filter(Boolean)
      .join('-');
    return tx.invoice.create({
      data: {
        invoiceNo,
        fiscalYear,
        sequence,
        orderId,
        kind: order.taxRateBps !== null ? 'tax_invoice' : 'receipt',
        buyerName: order.user.fullName,
        buyerContact: order.user.email ?? order.user.phone,
        seller: {
          businessName: tax.businessName,
          panNumber: tax.vatRegistered ? tax.panNumber : '',
          address: tax.address,
        },
        items: order.items.map((i) => ({
          title: i.titleSnapshot,
          unitPricePaisa: i.unitPricePaisa,
          validity: i.validitySnapshot,
        })) as Prisma.InputJsonValue,
        subtotalPaisa: order.subtotalPaisa,
        discountPaisa: order.discountPaisa,
        couponCode: order.couponCode,
        taxRateBps: order.taxRateBps,
        taxInclusive: order.taxInclusive,
        taxPaisa: order.taxPaisa,
        totalPaisa: order.totalPaisa,
        paidWith,
        issuedAt: now,
        emailStatus: order.user.email ? 'pending' : 'skipped',
      },
    });
  }

  /** A download link for the student's own receipt, valid for a few minutes (path under the API base). */
  async link(orderId: string, userId: string, now = new Date()) {
    const invoice = await this.prisma.invoice.findFirst({ where: { orderId, order: { userId } } });
    if (!invoice) throw Errors.notFound('Receipt');
    const exp = Math.floor(now.getTime() / 1000) + LINK_SECONDS;
    return {
      path: `/receipts/${invoice.id}/pdf?exp=${exp}&sig=${this.sign(invoice.id, exp)}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  /** The PDF for a signed link; a wrong, changed or expired link finds nothing. */
  async pdfFromLink(id: string, exp: string, sig: string, now = new Date()) {
    const expires = Number(exp);
    const expected = Buffer.from(this.sign(id, expires));
    const given = Buffer.from(sig ?? '');
    if (
      !Number.isSafeInteger(expires) ||
      expires * 1000 < now.getTime() ||
      expected.length !== given.length ||
      !timingSafeEqual(expected, given)
    ) {
      throw Errors.notFound('Receipt');
    }
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: { order: true } });
    if (!invoice) throw Errors.notFound('Receipt');
    return { filename: `${invoice.invoiceNo.replace(/\//g, '-')}.pdf`, body: await this.render(invoice) };
  }

  /**
   * Emails receipts not sent yet (each claimed by one caller at a time; retried a few times, minutes apart). Called
   * after a payment completes and by the worker every minute.
   */
  async sendPending(now = new Date()): Promise<number> {
    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE invoices SET email_attempt_at = ${now}, email_attempts = email_attempts + 1
      WHERE id IN (
        SELECT id FROM invoices
        WHERE email_status = 'pending' AND email_attempts < ${EMAIL_ATTEMPTS}
          AND (email_attempt_at IS NULL OR email_attempt_at < ${new Date(now.getTime() - EMAIL_RETRY_MS)})
        ORDER BY issued_at LIMIT 20 FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    let sent = 0;
    for (const { id } of claimed) {
      const invoice = await this.prisma.invoice.findUniqueOrThrow({
        where: { id },
        include: { order: { include: { user: { select: { email: true, locale: true, fullName: true } } } } },
      });
      const to = invoice.order.user.email;
      if (!to) {
        await this.prisma.invoice.update({ where: { id }, data: { emailStatus: 'skipped' } });
        continue;
      }
      try {
        const text = EMAIL_TEXT[invoice.order.user.locale];
        const orderNo = `#${String(invoice.order.orderNo).padStart(6, '0')}`;
        await this.mail.send({
          to,
          subject: text.subject(invoice.invoiceNo),
          text: text.body(
            invoice.order.user.fullName,
            invoice.invoiceNo,
            orderNo,
            formatNpr(invoice.totalPaisa, 'en'),
          ),
          attachments: [
            {
              filename: `${invoice.invoiceNo.replace(/\//g, '-')}.pdf`,
              content: await this.render(invoice),
              contentType: 'application/pdf',
            },
          ],
        });
        await this.prisma.invoice.update({
          where: { id },
          data: { emailStatus: 'sent', emailedAt: new Date() },
        });
        sent += 1;
      } catch (err) {
        this.logger.warn({ invoiceId: id, err: String(err) }, 'Receipt email failed');
        if (invoice.emailAttempts >= EMAIL_ATTEMPTS) {
          await this.prisma.invoice.update({ where: { id }, data: { emailStatus: 'failed' } });
        }
      }
    }
    return sent;
  }

  private render(invoice: Invoice & { order: { orderNo: number } }) {
    const content: ReceiptContent = {
      invoiceNo: invoice.invoiceNo,
      kind: invoice.kind,
      orderNo: invoice.order.orderNo,
      issuedAt: invoice.issuedAt,
      paidWith: invoice.paidWith,
      buyerName: invoice.buyerName,
      buyerContact: invoice.buyerContact,
      seller: invoice.seller as ReceiptContent['seller'],
      items: invoice.items as unknown as Array<{
        title: LocalizedText;
        unitPricePaisa: number;
        validity: { type: string; days: number | null; endsOn: string | null };
      }>,
      subtotalPaisa: invoice.subtotalPaisa,
      discountPaisa: invoice.discountPaisa,
      couponCode: invoice.couponCode,
      taxRateBps: invoice.taxRateBps,
      taxInclusive: invoice.taxInclusive,
      taxPaisa: invoice.taxPaisa,
      totalPaisa: invoice.totalPaisa,
    };
    return renderReceiptPdf(content);
  }

  private sign(id: string, exp: number) {
    return createHmac('sha256', this.linkKey).update(`${id}.${exp}`).digest('base64url');
  }
}
