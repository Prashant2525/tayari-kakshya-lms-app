-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "course_reviews" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "body" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "moderated_by" UUID,
    "moderated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_reviews_course_id_status_created_at_idx" ON "course_reviews"("course_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "course_reviews_status_created_at_idx" ON "course_reviews"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "course_reviews_course_id_user_id_key" ON "course_reviews"("course_id", "user_id");

-- AddForeignKey
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_body_check" CHECK ("body" IS NULL OR char_length("body") <= 2000);
-- A rejected review says why; only a moderated review records who and when.
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_rejection_check" CHECK (("status" = 'rejected') = ("rejection_reason" IS NOT NULL));
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_moderated_check" CHECK (("status" = 'pending') = ("moderated_at" IS NULL));
