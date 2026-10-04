-- CreateEnum
CREATE TYPE "PremiumAccessRule" AS ENUM ('linked', 'any_course', 'plans_only');

-- CreateEnum
CREATE TYPE "LateStartRule" AS ENUM ('until_close', 'full_duration');

-- CreateEnum
CREATE TYPE "CountedAttemptRule" AS ENUM ('first', 'best', 'latest');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('in_progress', 'pending_grading', 'completed', 'voided');

-- CreateEnum
CREATE TYPE "AnswerOutcome" AS ENUM ('correct', 'partial', 'wrong', 'skipped', 'pending');

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "counted_attempt" "CountedAttemptRule" NOT NULL DEFAULT 'first',
ADD COLUMN     "late_start" "LateStartRule" NOT NULL DEFAULT 'until_close',
ADD COLUMN     "premium_access" "PremiumAccessRule" NOT NULL DEFAULT 'linked';

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'in_progress',
    "auto_submitted" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "plan" JSONB NOT NULL,
    "max_score" INTEGER NOT NULL,
    "score" INTEGER,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "partial_count" INTEGER NOT NULL DEFAULT 0,
    "wrong_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "pending_count" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN,
    "time_taken_seconds" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "question_version_id" UUID NOT NULL,
    "response" JSONB,
    "marked_for_review" BOOLEAN NOT NULL DEFAULT false,
    "answered_at" TIMESTAMPTZ(6),
    "outcome" "AnswerOutcome",
    "awarded" INTEGER,
    "graded_by" UUID,
    "graded_at" TIMESTAMPTZ(6),
    "grader_comment" TEXT,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("attempt_id","question_id")
);

-- CreateIndex
CREATE INDEX "attempts_user_id_started_at_idx" ON "attempts"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "attempts_assessment_id_status_idx" ON "attempts"("assessment_id", "status");

-- CreateIndex
CREATE INDEX "attempts_status_deadline_at_idx" ON "attempts"("status", "deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_assessment_id_user_id_attempt_no_key" ON "attempts"("assessment_id", "user_id", "attempt_no");

-- CreateIndex
CREATE INDEX "attempt_answers_question_id_idx" ON "attempt_answers"("question_id");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one unfinished attempt per student and assessment (a second "start" resumes it).
CREATE UNIQUE INDEX "attempts_one_in_progress" ON "attempts" ("assessment_id", "user_id") WHERE "status" = 'in_progress';

ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_attempt_no_positive" CHECK ("attempt_no" >= 1),
  ADD CONSTRAINT "attempts_max_score_non_negative" CHECK ("max_score" >= 0),
  ADD CONSTRAINT "attempts_counts_non_negative" CHECK (
    "correct_count" >= 0 AND "partial_count" >= 0 AND "wrong_count" >= 0 AND "skipped_count" >= 0 AND "pending_count" >= 0
  ),
  ADD CONSTRAINT "attempts_finished_has_submit_time" CHECK ("status" = 'in_progress' OR "submitted_at" IS NOT NULL),
  ADD CONSTRAINT "attempts_deadline_after_start" CHECK ("deadline_at" IS NULL OR "deadline_at" >= "started_at");
