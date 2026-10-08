-- CreateEnum
CREATE TYPE "PracticeAnswerSource" AS ENUM ('practice', 'revision');

-- CreateEnum
CREATE TYPE "StudyActivity" AS ENUM ('video', 'reading', 'practice', 'test');

-- CreateTable
CREATE TABLE "practice_answers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "source" "PracticeAnswerSource" NOT NULL,
    "outcome" "AnswerOutcome" NOT NULL,
    "answered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_time" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "activity" "StudyActivity" NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "study_time_pkey" PRIMARY KEY ("user_id","day","activity")
);

-- CreateTable
CREATE TABLE "study_clocks" (
    "user_id" UUID NOT NULL,
    "last_report_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "study_clocks_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "practice_answers_user_id_answered_at_idx" ON "practice_answers"("user_id", "answered_at");

-- CreateIndex
CREATE INDEX "practice_answers_question_id_idx" ON "practice_answers"("question_id");

-- AddForeignKey
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_time" ADD CONSTRAINT "study_time_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_clocks" ADD CONSTRAINT "study_clocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only real outcomes are recorded (no skipped / pending).
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_outcome_check" CHECK ("outcome" IN ('correct', 'partial', 'wrong'));
-- A day never holds more than 24 hours of one activity.
ALTER TABLE "study_time" ADD CONSTRAINT "study_time_seconds_check" CHECK ("seconds" BETWEEN 0 AND 86400);
