-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "result_notified_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "assessment_reminders" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "minutes_before" INTEGER NOT NULL,
    "opens_at" TIMESTAMPTZ(6) NOT NULL,
    "sent" BOOLEAN NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_updates" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "message" JSONB NOT NULL,
    "recipients" INTEGER NOT NULL,
    "sent_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_reminders_assessment_id_minutes_before_opens_at_key" ON "assessment_reminders"("assessment_id", "minutes_before", "opens_at");

-- CreateIndex
CREATE INDEX "course_updates_course_id_created_at_idx" ON "course_updates"("course_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "assessment_reminders" ADD CONSTRAINT "assessment_reminders_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_updates" ADD CONSTRAINT "course_updates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_updates" ADD CONSTRAINT "course_updates_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Results already out before this change count as told: a deploy never sends old results (D-060).
UPDATE "attempts" t SET "result_notified_at" = COALESCE(t."submitted_at", now())
FROM "assessments" a
WHERE a."id" = t."assessment_id" AND t."status" = 'completed' AND (
  t."practice"
  OR a."result_release" = 'immediate'
  OR (a."result_release" = 'after_close' AND a."closes_at" <= now())
  OR (a."result_release" = 'manual' AND a."results_released_at" <= now())
);

-- The worker's queue: completed attempts whose students have not been told yet.
CREATE INDEX "attempts_result_unnotified_idx" ON "attempts" ("submitted_at")
  WHERE "status" = 'completed' AND "result_notified_at" IS NULL AND NOT "practice";

ALTER TABLE "assessment_reminders" ADD CONSTRAINT "assessment_reminders_values_check"
  CHECK ("minutes_before" > 0 AND "recipients" >= 0 AND ("sent" OR "recipients" = 0));
ALTER TABLE "course_updates" ADD CONSTRAINT "course_updates_values_check"
  CHECK ("recipients" >= 0 AND jsonb_typeof("title") = 'object' AND jsonb_typeof("message") = 'object');
