-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('android', 'ios', 'web');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('esewa', 'khalti', 'connectips');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('initiated', 'pending', 'completed', 'failed', 'cancelled', 'expired');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_no" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "channel" "OrderChannel" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NPR',
    "subtotal_paisa" INTEGER NOT NULL,
    "discount_paisa" INTEGER NOT NULL DEFAULT 0,
    "total_paisa" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_type" TEXT NOT NULL,
    "course_id" UUID,
    "title_snapshot" JSONB NOT NULL,
    "unit_price_paisa" INTEGER NOT NULL,
    "validity_snapshot" JSONB NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'initiated',
    "amount_paisa" INTEGER NOT NULL,
    "provider_reference" TEXT,
    "provider_transaction_id" TEXT,
    "return_to" TEXT NOT NULL,
    "duplicate" BOOLEAN NOT NULL DEFAULT false,
    "failure_reason" TEXT,
    "initiated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "last_checked_at" TIMESTAMPTZ(6),
    "check_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID,
    "provider" "PaymentProvider" NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_no_key" ON "orders"("order_no");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_status_expires_at_idx" ON "orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_course_id_idx" ON "order_items"("course_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_status_initiated_at_idx" ON "payments"("status", "initiated_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_reference_key" ON "payments"("provider", "provider_reference");

-- CreateIndex
CREATE INDEX "payment_events_payment_id_received_at_idx" ON "payment_events"("payment_id", "received_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules the database itself enforces (financial records).
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_check"
  CHECK ("subtotal_paisa" >= 0 AND "discount_paisa" >= 0 AND "total_paisa" > 0 AND "total_paisa" = "subtotal_paisa" - "discount_paisa");
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_check" CHECK (("status" = 'paid') = ("paid_at" IS NOT NULL));
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_check" CHECK ("unit_price_paisa" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount_paisa" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_completed_check" CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL));
-- A paid order grants access once, whatever retries or duplicate callbacks arrive.
CREATE UNIQUE INDEX "entitlements_one_per_order" ON "entitlements" ("source_id") WHERE "source_type" = 'order';
