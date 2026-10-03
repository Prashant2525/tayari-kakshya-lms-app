-- CreateTable
CREATE TABLE "learning_progress" (
    "user_id" UUID NOT NULL,
    "learning_item_id" UUID NOT NULL,
    "course_id" UUID,
    "position" INTEGER,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "learning_progress_pkey" PRIMARY KEY ("user_id","learning_item_id")
);

-- CreateIndex
CREATE INDEX "learning_progress_user_id_updated_at_idx" ON "learning_progress"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "learning_progress_learning_item_id_idx" ON "learning_progress"("learning_item_id");

-- AddForeignKey
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_learning_item_id_fkey" FOREIGN KEY ("learning_item_id") REFERENCES "learning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
