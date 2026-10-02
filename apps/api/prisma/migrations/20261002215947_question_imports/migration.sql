-- CreateEnum
CREATE TYPE "QuestionImportStatus" AS ENUM ('previewed', 'committed', 'expired');

-- CreateTable
CREATE TABLE "question_imports" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "QuestionImportStatus" NOT NULL DEFAULT 'previewed',
    "summary" JSONB NOT NULL,
    "payload" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ(6),
    "created_count" INTEGER,

    CONSTRAINT "question_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_imports_created_by_created_at_idx" ON "question_imports"("created_by", "created_at");

-- AddForeignKey
ALTER TABLE "question_imports" ADD CONSTRAINT "question_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
