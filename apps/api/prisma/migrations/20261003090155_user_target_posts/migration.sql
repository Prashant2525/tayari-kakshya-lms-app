-- CreateTable
CREATE TABLE "user_target_posts" (
    "user_id" UUID NOT NULL,
    "exam_node_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_target_posts_pkey" PRIMARY KEY ("user_id","exam_node_id")
);

-- CreateIndex
CREATE INDEX "user_target_posts_exam_node_id_idx" ON "user_target_posts"("exam_node_id");

-- AddForeignKey
ALTER TABLE "user_target_posts" ADD CONSTRAINT "user_target_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_target_posts" ADD CONSTRAINT "user_target_posts_exam_node_id_fkey" FOREIGN KEY ("exam_node_id") REFERENCES "exam_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
