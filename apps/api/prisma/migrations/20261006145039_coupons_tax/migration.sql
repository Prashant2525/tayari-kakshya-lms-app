-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "CouponAppliesTo" AS ENUM ('everything', 'all_courses', 'all_plans', 'selected');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "coupon_code" TEXT,
ADD COLUMN     "coupon_id" UUID,
ADD COLUMN     "tax_inclusive" BOOLEAN,
ADD COLUMN     "tax_paisa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tax_rate_bps" INTEGER;

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "note" TEXT,
    "discount_type" "CouponDiscountType" NOT NULL,
    "percent_bps" INTEGER,
    "amount_paisa" INTEGER,
    "max_discount_paisa" INTEGER,
    "min_order_paisa" INTEGER,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "max_redemptions" INTEGER,
    "per_user_limit" INTEGER,
    "applies_to" "CouponAppliesTo" NOT NULL,
    "allow_on_sale" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_targets" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "course_id" UUID,
    "plan_id" UUID,

    CONSTRAINT "coupon_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupon_targets_course_id_idx" ON "coupon_targets"("course_id");

-- CreateIndex
CREATE INDEX "coupon_targets_plan_id_idx" ON "coupon_targets"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_targets_coupon_id_course_id_key" ON "coupon_targets"("coupon_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_targets_coupon_id_plan_id_key" ON "coupon_targets"("coupon_id", "plan_id");

-- CreateIndex
CREATE INDEX "orders_coupon_id_status_idx" ON "orders"("coupon_id", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_targets" ADD CONSTRAINT "coupon_targets_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_targets" ADD CONSTRAINT "coupon_targets_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_targets" ADD CONSTRAINT "coupon_targets_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the database itself enforces (financial records, D-025, D-055, D-056).
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_code_check" CHECK ("code" ~ '^[A-Z0-9-]{3,32}$');
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_discount_check" CHECK (
  ("discount_type" = 'percent' AND "percent_bps" BETWEEN 1 AND 10000 AND "amount_paisa" IS NULL)
  OR ("discount_type" = 'fixed' AND "amount_paisa" > 0 AND "percent_bps" IS NULL AND "max_discount_paisa" IS NULL)
);
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_limits_check" CHECK (
  ("max_discount_paisa" IS NULL OR "max_discount_paisa" > 0)
  AND ("min_order_paisa" IS NULL OR "min_order_paisa" > 0)
  AND ("max_redemptions" IS NULL OR "max_redemptions" > 0)
  AND ("per_user_limit" IS NULL OR "per_user_limit" > 0)
  AND ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at")
);
ALTER TABLE "coupon_targets" ADD CONSTRAINT "coupon_targets_one_check" CHECK (num_nonnulls("course_id", "plan_id") = 1);

-- Orders: a coupon may take the total to Rs 0 (D-056); VAT added on top when prices exclude it (D-055).
ALTER TABLE "orders" DROP CONSTRAINT "orders_amounts_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_check" CHECK (
  "subtotal_paisa" > 0
  AND "discount_paisa" BETWEEN 0 AND "subtotal_paisa"
  AND "tax_paisa" >= 0
  AND "total_paisa" >= 0
  AND "total_paisa" = "subtotal_paisa" - "discount_paisa" + CASE WHEN "tax_inclusive" = false THEN "tax_paisa" ELSE 0 END
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_tax_check" CHECK (
  ("tax_rate_bps" IS NULL) = ("tax_inclusive" IS NULL)
  AND ("tax_rate_bps" IS NOT NULL OR "tax_paisa" = 0)
  AND ("tax_rate_bps" IS NULL OR "tax_rate_bps" BETWEEN 0 AND 10000)
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_check" CHECK (
  ("coupon_id" IS NULL) = ("coupon_code" IS NULL) AND ("discount_paisa" = 0 OR "coupon_id" IS NOT NULL)
);
