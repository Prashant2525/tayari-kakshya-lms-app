-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('receipt', 'tax_invoice');

-- CreateEnum
CREATE TYPE "InvoiceEmailStatus" AS ENUM ('pending', 'sent', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('requested', 'approved', 'rejected', 'refunded');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'refunded';

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "fiscal_year" TEXT,
    "sequence" INTEGER NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "buyer_contact" TEXT,
    "seller" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "subtotal_paisa" INTEGER NOT NULL,
    "discount_paisa" INTEGER NOT NULL,
    "coupon_code" TEXT,
    "tax_rate_bps" INTEGER,
    "tax_inclusive" BOOLEAN,
    "tax_paisa" INTEGER NOT NULL,
    "total_paisa" INTEGER NOT NULL,
    "paid_with" TEXT,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "email_status" "InvoiceEmailStatus" NOT NULL DEFAULT 'pending',
    "email_attempts" INTEGER NOT NULL DEFAULT 0,
    "email_attempt_at" TIMESTAMPTZ(6),
    "emailed_at" TIMESTAMPTZ(6),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "key" TEXT NOT NULL,
    "next_value" INTEGER NOT NULL,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount_paisa" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'requested',
    "full" BOOLEAN NOT NULL DEFAULT false,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "refunded_by" UUID,
    "refunded_at" TIMESTAMPTZ(6),
    "provider_reference" TEXT,
    "refund_note" TEXT,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_no_key" ON "invoices"("invoice_no");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_email_status_email_attempt_at_idx" ON "invoices"("email_status", "email_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_fiscal_year_sequence_key" ON "invoices"("fiscal_year", "sequence");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "refunds_status_requested_at_idx" ON "refunds"("status", "requested_at");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_refunded_by_fkey" FOREIGN KEY ("refunded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules the database itself enforces (financial records, D-026, D-057).
-- (The new enum value cannot be used in this transaction, so the status is compared as text.)
ALTER TABLE "orders" DROP CONSTRAINT "orders_paid_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_check" CHECK (("status"::text IN ('paid', 'refunded')) = ("paid_at" IS NOT NULL));

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_check" CHECK (
  "sequence" > 0 AND "subtotal_paisa" >= 0 AND "discount_paisa" >= 0 AND "tax_paisa" >= 0 AND "total_paisa" >= 0
);

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_check" CHECK ("amount_paisa" > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_check" CHECK (
  ("status" = 'requested') = ("decided_at" IS NULL)
  AND ("status" = 'requested') = ("decided_by" IS NULL)
  AND ("status" = 'refunded') = ("refunded_at" IS NOT NULL)
  AND ("status" <> 'refunded' OR ("provider_reference" IS NOT NULL AND "refunded_by" IS NOT NULL))
  AND (NOT "full" OR "status" IN ('approved', 'refunded'))
);

-- A receipt never changes once issued (only its email delivery is tracked) and is never deleted.
CREATE FUNCTION invoices_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'receipts are never deleted';
  END IF;
  IF (NEW.invoice_no, NEW.fiscal_year, NEW.sequence, NEW.order_id, NEW.kind, NEW.buyer_name, NEW.buyer_contact,
      NEW.seller, NEW.items, NEW.subtotal_paisa, NEW.discount_paisa, NEW.coupon_code, NEW.tax_rate_bps,
      NEW.tax_inclusive, NEW.tax_paisa, NEW.total_paisa, NEW.paid_with, NEW.issued_at)
     IS DISTINCT FROM
     (OLD.invoice_no, OLD.fiscal_year, OLD.sequence, OLD.order_id, OLD.kind, OLD.buyer_name, OLD.buyer_contact,
      OLD.seller, OLD.items, OLD.subtotal_paisa, OLD.discount_paisa, OLD.coupon_code, OLD.tax_rate_bps,
      OLD.tax_inclusive, OLD.tax_paisa, OLD.total_paisa, OLD.paid_with, OLD.issued_at) THEN
    RAISE EXCEPTION 'receipts cannot be changed once issued';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER invoices_immutable BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION invoices_immutable();
