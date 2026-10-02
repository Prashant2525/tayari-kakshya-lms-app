-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'match', 'numeric', 'subjective');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "QuestionReportReason" AS ENUM ('wrong_answer', 'typo', 'unclear', 'outdated', 'other');

-- CreateEnum
CREATE TYPE "QuestionReportStatus" AS ENUM ('open', 'resolved', 'rejected');

-- CreateTable
CREATE TABLE "question_groups" (
    "id" UUID NOT NULL,
    "title" JSONB,
    "passage" JSONB NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "question_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "topic_id" UUID,
    "group_id" UUID,
    "difficulty" "Difficulty" NOT NULL,
    "default_marks" DECIMAL(6,2) NOT NULL,
    "default_negative_marks" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "language" "ContentLanguage" NOT NULL DEFAULT 'both',
    "access_level" "AccessLevel" NOT NULL DEFAULT 'premium',
    "is_pyq" BOOLEAN NOT NULL DEFAULT false,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "current_version_id" UUID,
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_versions" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_sources" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "exam_node_id" UUID,
    "paper_id" UUID,
    "year_bs" INTEGER,
    "note" TEXT,

    CONSTRAINT "question_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_tags" (
    "question_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "question_tags_pkey" PRIMARY KEY ("question_id","tag_id")
);

-- CreateTable
CREATE TABLE "question_reports" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" "QuestionReportReason" NOT NULL,
    "message" TEXT,
    "status" "QuestionReportStatus" NOT NULL DEFAULT 'open',
    "resolved_by" UUID,
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "questions_current_version_id_key" ON "questions"("current_version_id");

-- CreateIndex
CREATE INDEX "questions_subject_id_topic_id_type_difficulty_status_idx" ON "questions"("subject_id", "topic_id", "type", "difficulty", "status");

-- CreateIndex
CREATE INDEX "questions_group_id_idx" ON "questions"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_versions_question_id_version_no_key" ON "question_versions"("question_id", "version_no");

-- CreateIndex
CREATE INDEX "question_sources_question_id_idx" ON "question_sources"("question_id");

-- CreateIndex
CREATE INDEX "question_sources_exam_node_id_year_bs_idx" ON "question_sources"("exam_node_id", "year_bs");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "question_tags_tag_id_idx" ON "question_tags"("tag_id");

-- CreateIndex
CREATE INDEX "question_reports_status_created_at_idx" ON "question_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "question_reports_question_id_idx" ON "question_reports"("question_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "question_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_exam_node_id_fkey" FOREIGN KEY ("exam_node_id") REFERENCES "exam_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───── Integrity rules not expressible in the Prisma schema ─────
ALTER TABLE "questions" ADD CONSTRAINT "questions_marks_check"
  CHECK ("default_marks" >= 0 AND "default_negative_marks" >= 0);
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_year_check"
  CHECK ("year_bs" IS NULL OR "year_bs" BETWEEN 2000 AND 2100);
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_version_no_check" CHECK ("version_no" >= 1);

-- Versions are immutable: attempts reference exactly what the student saw. Edits insert a new version.
CREATE FUNCTION "question_versions_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'question_versions rows are immutable (create a new version instead)'
    USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER "question_versions_no_update_delete"
  BEFORE UPDATE OR DELETE ON "question_versions"
  FOR EACH ROW EXECUTE FUNCTION "question_versions_immutable"();

-- Search and filters.
CREATE INDEX "questions_search_trgm" ON "questions" USING gin ("search_text" gin_trgm_ops) WHERE "deleted_at" IS NULL;
CREATE INDEX "questions_pyq" ON "questions" ("subject_id") WHERE "is_pyq" AND "deleted_at" IS NULL;

-- One open report per student per question (students can report again after it is resolved).
CREATE UNIQUE INDEX "question_reports_one_open" ON "question_reports" ("question_id", "user_id") WHERE "status" = 'open';
