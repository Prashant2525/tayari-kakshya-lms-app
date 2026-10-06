-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('joined', 'rewarded', 'cancelled');

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "owner_user_id" UUID;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "referral_id" UUID;

-- CreateTable
CREATE TABLE "referral_codes" (
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "referrer_id" UUID NOT NULL,
    "referee_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'joined',
    "first_order_id" UUID,
    "reward_coupon_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewarded_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referee_id_key" ON "referrals"("referee_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_first_order_id_key" ON "referrals"("first_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_reward_coupon_id_key" ON "referrals"("reward_coupon_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_created_at_idx" ON "referrals"("referrer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "coupons_owner_user_id_idx" ON "coupons"("owner_user_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_reward_coupon_id_fkey" FOREIGN KEY ("reward_coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules the database itself enforces (D-058, D-059).
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_code_check" CHECK ("code" ~ '^[A-Z0-9]{6,12}$');
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_self_check" CHECK ("referrer_id" <> "referee_id");
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_status_check" CHECK (
  ("status" = 'joined') = ("rewarded_at" IS NULL)
  AND ("status" = 'cancelled') = ("cancelled_at" IS NOT NULL)
  AND ("status" = 'joined' OR "first_order_id" IS NOT NULL)
);
-- One discount per order: a coupon or the referral discount, never both (D-059).
ALTER TABLE "orders" DROP CONSTRAINT "orders_coupon_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_check" CHECK (
  ("coupon_id" IS NULL) = ("coupon_code" IS NULL)
  AND NOT ("coupon_id" IS NOT NULL AND "referral_id" IS NOT NULL)
  AND ("discount_paisa" = 0 OR "coupon_id" IS NOT NULL OR "referral_id" IS NOT NULL)
);
