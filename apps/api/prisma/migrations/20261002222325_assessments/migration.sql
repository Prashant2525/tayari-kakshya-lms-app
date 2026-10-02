-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('quiz', 'subject_test', 'weekly', 'mock', 'pyq_mock', 'daily_challenge');

-- CreateEnum
CREATE TYPE "AssessmentAvailability" AS ENUM ('always', 'window');

-- CreateEnum
CREATE TYPE "ResultRelease" AS ENUM ('immediate', 'after_close', 'manual');

-- CreateEnum
CREATE TYPE "SubjectiveGrading" AS ENUM ('none', 'self', 'instructor');

-- CreateEnum
CREATE TYPE "SectionPickMode" AS ENUM ('fixed', 'random');

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "type" "AssessmentType" NOT NULL,
    "title" JSONB NOT NULL,
    "instructions" JSONB,
    "course_id" UUID,
    "subject_id" UUID,
    "chapter_id" UUID,
    "topic_id" UUID,
    "exam_node_id" UUID,
    "access_level" "AccessLevel" NOT NULL DEFAULT 'premium',
    "availability" "AssessmentAvailability" NOT NULL,
    "opens_at" TIMESTAMPTZ(6),
    "closes_at" TIMESTAMPTZ(6),
    "duration_seconds" INTEGER,
    "max_attempts" INTEGER,
    "pass_marks" DECIMAL(8,2),
    "scoring" JSONB NOT NULL,
    "shuffle_questions" BOOLEAN NOT NULL,
    "shuffle_options" BOOLEAN NOT NULL,
    "result_release" "ResultRelease" NOT NULL,
    "results_released_at" TIMESTAMPTZ(6),
    "show_explanations" BOOLEAN NOT NULL,
    "leaderboard_enabled" BOOLEAN NOT NULL,
    "subjective_grading" "SubjectiveGrading" NOT NULL,
    "challenge_date" DATE,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "publish_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_sections" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "title" JSONB,
    "sort_order" INTEGER NOT NULL,
    "pick_mode" "SectionPickMode" NOT NULL,
    "filter" JSONB,
    "question_count" INTEGER,
    "marks_per_question" DECIMAL(6,2),
    "negative_marks_per_question" DECIMAL(6,2),

    CONSTRAINT "assessment_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_questions" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "marks" DECIMAL(6,2),
    "negative_marks" DECIMAL(6,2),

    CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessments_type_status_idx" ON "assessments"("type", "status");

-- CreateIndex
CREATE INDEX "assessments_course_id_idx" ON "assessments"("course_id");

-- CreateIndex
CREATE INDEX "assessments_subject_id_idx" ON "assessments"("subject_id");

-- CreateIndex
CREATE INDEX "assessment_sections_assessment_id_sort_order_idx" ON "assessment_sections"("assessment_id", "sort_order");

-- CreateIndex
CREATE INDEX "assessment_questions_section_id_sort_order_idx" ON "assessment_questions"("section_id", "sort_order");

-- CreateIndex
CREATE INDEX "assessment_questions_question_id_idx" ON "assessment_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_assessment_id_question_id_key" ON "assessment_questions"("assessment_id", "question_id");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_exam_node_id_fkey" FOREIGN KEY ("exam_node_id") REFERENCES "exam_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "assessment_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Integrity rules (D-021) ─────
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_window_check"
  CHECK ("availability" = 'always' OR ("opens_at" IS NOT NULL AND "closes_at" IS NOT NULL AND "opens_at" < "closes_at"));
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_numbers_check"
  CHECK (("duration_seconds" IS NULL OR "duration_seconds" > 0)
     AND ("max_attempts" IS NULL OR "max_attempts" > 0)
     AND ("pass_marks" IS NULL OR "pass_marks" >= 0));
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_challenge_check"
  CHECK (("type" = 'daily_challenge') = ("challenge_date" IS NOT NULL));
-- One live daily challenge per day.
CREATE UNIQUE INDEX "assessments_one_challenge_per_day" ON "assessments" ("challenge_date")
  WHERE "type" = 'daily_challenge' AND "deleted_at" IS NULL;
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_pick_check"
  CHECK (("pick_mode" = 'fixed' AND "question_count" IS NULL AND "filter" IS NULL)
      OR ("pick_mode" = 'random' AND "question_count" > 0 AND "filter" IS NOT NULL));
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_marks_check"
  CHECK (("marks_per_question" IS NULL OR "marks_per_question" >= 0)
     AND ("negative_marks_per_question" IS NULL OR "negative_marks_per_question" >= 0));
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_marks_check"
  CHECK (("marks" IS NULL OR "marks" >= 0) AND ("negative_marks" IS NULL OR "negative_marks" >= 0));
