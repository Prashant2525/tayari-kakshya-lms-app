-- CreateEnum
CREATE TYPE "MistakeStatus" AS ENUM ('active', 'mastered', 'removed');

-- CreateEnum
CREATE TYPE "MistakeSource" AS ENUM ('test', 'practice');

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "mistakes_synced_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "mistakes" (
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "status" "MistakeStatus" NOT NULL DEFAULT 'active',
    "times_wrong" INTEGER NOT NULL DEFAULT 1,
    "correct_streak" INTEGER NOT NULL DEFAULT 0,
    "last_source" "MistakeSource" NOT NULL,
    "last_wrong_at" TIMESTAMPTZ(6) NOT NULL,
    "last_reviewed_at" TIMESTAMPTZ(6),
    "mastered_at" TIMESTAMPTZ(6),
    "answer_visible" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mistakes_pkey" PRIMARY KEY ("user_id","question_id")
);

-- CreateIndex
CREATE INDEX "mistakes_user_id_status_last_wrong_at_idx" ON "mistakes"("user_id", "status", "last_wrong_at" DESC);

-- CreateIndex
CREATE INDEX "mistakes_question_id_idx" ON "mistakes"("question_id");

-- AddForeignKey
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the database itself enforces.
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_counts_check" CHECK ("times_wrong" >= 1 AND "correct_streak" >= 0);
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_mastered_check" CHECK (("status" = 'mastered') = ("mastered_at" IS NOT NULL));
