-- CreateEnum
CREATE TYPE "ArticleKind" AS ENUM ('current_affairs', 'gorkhapatra', 'news', 'blog');

-- CreateEnum
CREATE TYPE "ArticlePeriod" AS ENUM ('daily', 'weekly', 'monthly', 'yearly');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'article';

-- CreateTable
CREATE TABLE "article_categories" (
    "id" UUID NOT NULL,
    "kind" "ArticleKind" NOT NULL,
    "name" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "article_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "kind" "ArticleKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "summary" JSONB,
    "body" JSONB NOT NULL,
    "cover_media_id" UUID,
    "category_id" UUID,
    "period" "ArticlePeriod",
    "period_date" DATE,
    "source_name" TEXT,
    "source_url" TEXT,
    "quiz_assessment_id" UUID,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "notified_at" TIMESTAMPTZ(6),
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "publish_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_categories_kind_sort_order_idx" ON "article_categories"("kind", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_kind_status_publish_at_idx" ON "articles"("kind", "status", "publish_at");

-- CreateIndex
CREATE INDEX "articles_category_id_idx" ON "articles"("category_id");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "article_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_quiz_assessment_id_fkey" FOREIGN KEY ("quiz_assessment_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- D-018 / D-063: periods are for current affairs only; Gorkhapatra summaries carry the issue date and a source link.
ALTER TABLE "articles" ADD CONSTRAINT "articles_rules_check" CHECK (
  ("kind" = 'current_affairs') = ("period" IS NOT NULL)
  AND ("kind" <> 'current_affairs' OR "period_date" IS NOT NULL)
  AND ("kind" <> 'gorkhapatra' OR ("period_date" IS NOT NULL AND "source_url" IS NOT NULL))
  AND ("source_url" IS NULL OR "source_url" LIKE 'https://%')
  AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  AND jsonb_typeof("title") = 'object' AND jsonb_typeof("body") = 'object'
);
ALTER TABLE "article_categories" ADD CONSTRAINT "article_categories_name_check" CHECK (jsonb_typeof("name") = 'object');

-- The app and website lists: live articles of a kind, newest first.
CREATE INDEX "articles_live_idx" ON "articles" ("kind", "publish_at" DESC) WHERE "deleted_at" IS NULL;
