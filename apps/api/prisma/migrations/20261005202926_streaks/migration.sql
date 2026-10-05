-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "practice" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_streaks" (
    "user_id" UUID NOT NULL,
    "current_days" INTEGER NOT NULL DEFAULT 0,
    "longest_days" INTEGER NOT NULL DEFAULT 0,
    "last_day" DATE NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_streaks"
  ADD CONSTRAINT "user_streaks_days_non_negative" CHECK ("current_days" >= 0 AND "longest_days" >= "current_days");

-- Rankings read the counted attempts of one assessment.
CREATE INDEX "attempts_ranking_idx" ON "attempts" ("assessment_id", "practice", "status");
