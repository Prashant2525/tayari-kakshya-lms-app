-- CreateEnum
CREATE TYPE "AccountEmailStatus" AS ENUM ('pending', 'sent', 'skipped', 'failed');

-- CreateTable
CREATE TABLE "course_interests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "device_name" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contacted_at" TIMESTAMPTZ(6),
    "contacted_by" UUID,

    CONSTRAINT "course_interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_emails" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "AccountEmailStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attempt_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_interests_last_seen_at_idx" ON "course_interests"("last_seen_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "course_interests_user_id_course_id_key" ON "course_interests"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "account_emails_status_attempt_at_idx" ON "account_emails"("status", "attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "account_emails_user_id_kind_key" ON "account_emails"("user_id", "kind");

-- AddForeignKey
ALTER TABLE "course_interests" ADD CONSTRAINT "course_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_interests" ADD CONSTRAINT "course_interests_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_interests" ADD CONSTRAINT "course_interests_contacted_by_fkey" FOREIGN KEY ("contacted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_emails" ADD CONSTRAINT "account_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Students who joined before welcome emails existed are not sent one now (D-061).
INSERT INTO "account_emails" ("id", "user_id", "kind", "status")
SELECT gen_random_uuid(), "id", 'welcome', 'skipped' FROM "users" WHERE "kind" = 'student';

ALTER TABLE "account_emails" ADD CONSTRAINT "account_emails_sent_check"
  CHECK (("status" = 'sent') = ("sent_at" IS NOT NULL) AND "attempts" >= 0);
ALTER TABLE "course_interests" ADD CONSTRAINT "course_interests_views_check"
  CHECK ("views" >= 1 AND "last_seen_at" >= "first_seen_at");
