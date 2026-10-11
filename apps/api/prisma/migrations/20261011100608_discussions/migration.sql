-- CreateEnum
CREATE TYPE "DiscussionTarget" AS ENUM ('question', 'lesson');

-- CreateEnum
CREATE TYPE "DiscussionPostStatus" AS ENUM ('visible', 'hidden', 'deleted');

-- CreateEnum
CREATE TYPE "DiscussionReportReason" AS ENUM ('spam', 'rude', 'wrong', 'other');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'discussion';

-- CreateTable
CREATE TABLE "discussion_posts" (
    "id" UUID NOT NULL,
    "target_type" "DiscussionTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "parent_id" UUID,
    "user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" "DiscussionPostStatus" NOT NULL DEFAULT 'visible',
    "is_best" BOOLEAN NOT NULL DEFAULT false,
    "hidden_reason" TEXT,
    "hidden_by" UUID,
    "hidden_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "discussion_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_reports" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" "DiscussionReportReason" NOT NULL,
    "message" TEXT,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discussion_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_bans" (
    "user_id" UUID NOT NULL,
    "until" TIMESTAMPTZ(6),
    "reason" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discussion_bans_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "discussion_posts_target_type_target_id_created_at_idx" ON "discussion_posts"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "discussion_posts_parent_id_created_at_idx" ON "discussion_posts"("parent_id", "created_at");

-- CreateIndex
CREATE INDEX "discussion_posts_status_created_at_idx" ON "discussion_posts"("status", "created_at");

-- CreateIndex
CREATE INDEX "discussion_posts_user_id_idx" ON "discussion_posts"("user_id");

-- CreateIndex
CREATE INDEX "discussion_reports_open_created_at_idx" ON "discussion_reports"("open", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "discussion_reports_post_id_user_id_key" ON "discussion_reports"("post_id", "user_id");

-- AddForeignKey
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "discussion_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_hidden_by_fkey" FOREIGN KEY ("hidden_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_reports" ADD CONSTRAINT "discussion_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "discussion_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_reports" ADD CONSTRAINT "discussion_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_bans" ADD CONSTRAINT "discussion_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_bans" ADD CONSTRAINT "discussion_bans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_body_check" CHECK (char_length("body") <= 2000);
-- Only replies can be the best answer, and one per doubt.
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_best_check" CHECK (NOT "is_best" OR "parent_id" IS NOT NULL);
CREATE UNIQUE INDEX "discussion_posts_one_best" ON "discussion_posts"("parent_id") WHERE "is_best";
-- A hidden post says why and who hid it.
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_hidden_check" CHECK (("status" = 'hidden') = ("hidden_reason" IS NOT NULL AND "hidden_at" IS NOT NULL));
ALTER TABLE "discussion_reports" ADD CONSTRAINT "discussion_reports_message_check" CHECK ("message" IS NULL OR char_length("message") <= 500);
