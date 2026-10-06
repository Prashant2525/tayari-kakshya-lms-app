-- CreateEnum
CREATE TYPE "PlanCoverage" AS ENUM ('all_courses', 'selected');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "plan_id" UUID;

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "features" JSONB NOT NULL DEFAULT '[]',
    "price_paisa" INTEGER NOT NULL DEFAULT 0,
    "sale_price_paisa" INTEGER,
    "sale_starts_at" TIMESTAMPTZ(6),
    "sale_ends_at" TIMESTAMPTZ(6),
    "validity_type" "ValidityType" NOT NULL DEFAULT 'days',
    "validity_days" INTEGER,
    "validity_ends_on" DATE,
    "coverage" "PlanCoverage" NOT NULL DEFAULT 'selected',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "publish_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_courses" (
    "plan_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_courses_pkey" PRIMARY KEY ("plan_id","course_id")
);

-- CreateIndex
CREATE INDEX "plans_status_sort_order_idx" ON "plans"("status", "sort_order");

-- CreateIndex
CREATE INDEX "plan_courses_course_id_idx" ON "plan_courses"("course_id");

-- CreateIndex
CREATE INDEX "order_items_plan_id_idx" ON "order_items"("plan_id");

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the database itself enforces.
ALTER TABLE "plans" ADD CONSTRAINT "plans_price_check"
  CHECK ("price_paisa" >= 0 AND ("sale_price_paisa" IS NULL OR ("sale_price_paisa" > 0 AND "sale_price_paisa" < "price_paisa")));
ALTER TABLE "plans" ADD CONSTRAINT "plans_validity_check" CHECK (
  ("validity_type" = 'days' AND "validity_days" > 0) OR
  ("validity_type" = 'fixed_date' AND "validity_ends_on" IS NOT NULL) OR
  ("validity_type" = 'lifetime'));
CREATE UNIQUE INDEX "plans_slug_live_key" ON "plans" ("slug") WHERE "deleted_at" IS NULL;
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_plan_scope_check" CHECK ("scope_type" <> 'plan' OR "plan_id" IS NOT NULL);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_one_item_check"
  CHECK ((("course_id" IS NOT NULL)::int + ("plan_id" IS NOT NULL)::int) = 1);
