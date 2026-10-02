-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('image', 'pdf');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('draft', 'in_review', 'scheduled', 'published', 'archived');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('free', 'premium');

-- CreateEnum
CREATE TYPE "ExamNodeType" AS ENUM ('authority', 'level', 'service', 'group', 'post');

-- CreateEnum
CREATE TYPE "LearningItemType" AS ENUM ('note', 'pdf', 'video');

-- CreateEnum
CREATE TYPE "ContentLanguage" AS ENUM ('en', 'ne', 'both');

-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('bunny', 'youtube');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('uploading', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "ValidityType" AS ENUM ('days', 'fixed_date', 'lifetime');

-- CreateEnum
CREATE TYPE "EntitlementScope" AS ENUM ('course', 'plan');

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('order', 'admin_grant', 'coupon', 'referral');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('active', 'revoked', 'expired');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "visibility" "MediaVisibility" NOT NULL,
    "object_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "page_count" INTEGER,
    "variants" JSONB,
    "alt_text" JSONB,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_nodes" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "node_type" "ExamNodeType" NOT NULL,
    "name" JSONB NOT NULL,
    "slug" TEXT NOT NULL,
    "description" JSONB,
    "icon_media_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "exam_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "papers" (
    "id" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "code" TEXT,
    "full_marks" DECIMAL(6,2),
    "pass_marks" DECIMAL(6,2),
    "duration_minutes" INTEGER,
    "pattern" JSONB,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_papers" (
    "exam_node_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_papers_pkey" PRIMARY KEY ("exam_node_id","paper_id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "summary" JSONB,
    "icon_media_id" UUID,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "number_label" TEXT,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "estimated_minutes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "number_label" TEXT,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "estimated_minutes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_items" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "type" "LearningItemType" NOT NULL,
    "title" JSONB NOT NULL,
    "access_level" "AccessLevel" NOT NULL DEFAULT 'premium',
    "language" "ContentLanguage" NOT NULL DEFAULT 'both',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "publish_at" TIMESTAMPTZ(6),
    "note_content" JSONB,
    "pdf_media_id" UUID,
    "downloadable" BOOLEAN NOT NULL DEFAULT false,
    "video_asset_id" UUID,
    "duration_seconds" INTEGER,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "learning_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_assets" (
    "id" UUID NOT NULL,
    "provider" "VideoProvider" NOT NULL,
    "provider_video_id" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'ready',
    "title" TEXT,
    "duration_seconds" INTEGER,
    "thumbnail_url" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "short_description" JSONB,
    "description" JSONB,
    "thumbnail_media_id" UUID,
    "language" "ContentLanguage" NOT NULL DEFAULT 'both',
    "price_paisa" INTEGER NOT NULL DEFAULT 0,
    "sale_price_paisa" INTEGER,
    "sale_starts_at" TIMESTAMPTZ(6),
    "sale_ends_at" TIMESTAMPTZ(6),
    "validity_type" "ValidityType" NOT NULL DEFAULT 'lifetime',
    "validity_days" INTEGER,
    "validity_ends_on" DATE,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "popularity_rank" INTEGER,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "publish_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_exam_nodes" (
    "course_id" UUID NOT NULL,
    "exam_node_id" UUID NOT NULL,

    CONSTRAINT "course_exam_nodes_pkey" PRIMARY KEY ("course_id","exam_node_id")
);

-- CreateTable
CREATE TABLE "course_subjects" (
    "course_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "paper_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "display_full_marks" DECIMAL(6,2),
    "display_pass_marks" DECIMAL(6,2),
    "display_duration_minutes" INTEGER,

    CONSTRAINT "course_subjects_pkey" PRIMARY KEY ("course_id","subject_id")
);

-- CreateTable
CREATE TABLE "course_instructors" (
    "course_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "course_instructors_pkey" PRIMARY KEY ("course_id","user_id")
);

-- CreateTable
CREATE TABLE "instructor_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" JSONB NOT NULL,
    "bio" JSONB,
    "photo_media_id" UUID,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "instructor_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scope_type" "EntitlementScope" NOT NULL,
    "course_id" UUID,
    "plan_id" UUID,
    "source_type" "EntitlementSource" NOT NULL,
    "source_id" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6),
    "status" "EntitlementStatus" NOT NULL DEFAULT 'active',
    "granted_by" UUID,
    "note" TEXT,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_object_key_key" ON "media_assets"("object_key");

-- CreateIndex
CREATE INDEX "media_assets_kind_created_at_idx" ON "media_assets"("kind", "created_at" DESC);

-- CreateIndex
CREATE INDEX "media_assets_sha256_idx" ON "media_assets"("sha256");

-- CreateIndex
CREATE INDEX "exam_nodes_parent_id_sort_order_idx" ON "exam_nodes"("parent_id", "sort_order");

-- CreateIndex
CREATE INDEX "chapters_subject_id_sort_order_idx" ON "chapters"("subject_id", "sort_order");

-- CreateIndex
CREATE INDEX "topics_chapter_id_sort_order_idx" ON "topics"("chapter_id", "sort_order");

-- CreateIndex
CREATE INDEX "learning_items_topic_id_sort_order_idx" ON "learning_items"("topic_id", "sort_order");

-- CreateIndex
CREATE INDEX "learning_items_status_publish_at_idx" ON "learning_items"("status", "publish_at");

-- CreateIndex
CREATE UNIQUE INDEX "video_assets_provider_provider_video_id_key" ON "video_assets"("provider", "provider_video_id");

-- CreateIndex
CREATE INDEX "courses_status_is_featured_popularity_rank_idx" ON "courses"("status", "is_featured", "popularity_rank");

-- CreateIndex
CREATE INDEX "course_exam_nodes_exam_node_id_idx" ON "course_exam_nodes"("exam_node_id");

-- CreateIndex
CREATE INDEX "course_subjects_subject_id_idx" ON "course_subjects"("subject_id");

-- CreateIndex
CREATE INDEX "entitlements_user_id_status_idx" ON "entitlements"("user_id", "status");

-- CreateIndex
CREATE INDEX "entitlements_course_id_idx" ON "entitlements"("course_id");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_nodes" ADD CONSTRAINT "exam_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "exam_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_nodes" ADD CONSTRAINT "exam_nodes_icon_media_id_fkey" FOREIGN KEY ("icon_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_papers" ADD CONSTRAINT "post_papers_exam_node_id_fkey" FOREIGN KEY ("exam_node_id") REFERENCES "exam_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_papers" ADD CONSTRAINT "post_papers_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_icon_media_id_fkey" FOREIGN KEY ("icon_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_pdf_media_id_fkey" FOREIGN KEY ("pdf_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_video_asset_id_fkey" FOREIGN KEY ("video_asset_id") REFERENCES "video_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_thumbnail_media_id_fkey" FOREIGN KEY ("thumbnail_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_exam_nodes" ADD CONSTRAINT "course_exam_nodes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_exam_nodes" ADD CONSTRAINT "course_exam_nodes_exam_node_id_fkey" FOREIGN KEY ("exam_node_id") REFERENCES "exam_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subjects" ADD CONSTRAINT "course_subjects_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subjects" ADD CONSTRAINT "course_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subjects" ADD CONSTRAINT "course_subjects_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_instructors" ADD CONSTRAINT "course_instructors_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_instructors" ADD CONSTRAINT "course_instructors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_profiles" ADD CONSTRAINT "instructor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_profiles" ADD CONSTRAINT "instructor_profiles_photo_media_id_fkey" FOREIGN KEY ("photo_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Constraints Prisma cannot express (docs/DATABASE_ARCHITECTURE.md §5) ─────────────

-- Slugs are unique among live (not soft-deleted) rows.
CREATE UNIQUE INDEX "exam_nodes_slug_live_key" ON "exam_nodes"("slug") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "courses_slug_live_key" ON "courses"("slug") WHERE "deleted_at" IS NULL;

-- Money is integer paisa and never negative; a sale price never exceeds the price.
ALTER TABLE "courses" ADD CONSTRAINT "courses_price_check" CHECK ("price_paisa" >= 0);
ALTER TABLE "courses" ADD CONSTRAINT "courses_sale_price_check"
  CHECK ("sale_price_paisa" IS NULL OR ("sale_price_paisa" >= 0 AND "sale_price_paisa" <= "price_paisa"));
ALTER TABLE "courses" ADD CONSTRAINT "courses_sale_window_check"
  CHECK ("sale_starts_at" IS NULL OR "sale_ends_at" IS NULL OR "sale_starts_at" < "sale_ends_at");

-- Validity fields match the validity type.
ALTER TABLE "courses" ADD CONSTRAINT "courses_validity_check" CHECK (
  ("validity_type" = 'days' AND "validity_days" > 0 AND "validity_ends_on" IS NULL) OR
  ("validity_type" = 'fixed_date' AND "validity_ends_on" IS NOT NULL AND "validity_days" IS NULL) OR
  ("validity_type" = 'lifetime' AND "validity_days" IS NULL AND "validity_ends_on" IS NULL)
);

-- Marks are non-negative and pass marks never exceed full marks.
ALTER TABLE "papers" ADD CONSTRAINT "papers_marks_check" CHECK (
  ("full_marks" IS NULL OR "full_marks" >= 0) AND ("pass_marks" IS NULL OR "pass_marks" >= 0) AND
  ("full_marks" IS NULL OR "pass_marks" IS NULL OR "pass_marks" <= "full_marks")
);
ALTER TABLE "course_subjects" ADD CONSTRAINT "course_subjects_marks_check" CHECK (
  "display_full_marks" IS NULL OR "display_pass_marks" IS NULL OR "display_pass_marks" <= "display_full_marks"
);

-- A learning item carries exactly the payload its type needs.
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_payload_check" CHECK (
  ("type" = 'note' AND "pdf_media_id" IS NULL AND "video_asset_id" IS NULL) OR
  ("type" = 'pdf' AND "video_asset_id" IS NULL AND "note_content" IS NULL) OR
  ("type" = 'video' AND "pdf_media_id" IS NULL AND "note_content" IS NULL)
);

-- Entitlements point at exactly one scope.
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_scope_check" CHECK (
  ("scope_type" = 'course' AND "course_id" IS NOT NULL AND "plan_id" IS NULL) OR
  ("scope_type" = 'plan' AND "plan_id" IS NOT NULL AND "course_id" IS NULL)
);
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_window_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

-- Search: trigram indexes on English/Nepali titles for admin and catalog search.
CREATE INDEX "courses_title_en_trgm" ON "courses" USING GIN (("title"->>'en') gin_trgm_ops);
CREATE INDEX "courses_title_ne_trgm" ON "courses" USING GIN (("title"->>'ne') gin_trgm_ops);
