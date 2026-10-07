-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('app', 'website', 'both');

-- CreateEnum
CREATE TYPE "BannerLinkType" AS ENUM ('none', 'course', 'plan', 'article', 'page', 'url');

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "image_media_id" UUID NOT NULL,
    "link_type" "BannerLinkType" NOT NULL,
    "link_value" TEXT NOT NULL DEFAULT '',
    "placement" "BannerPlacement" NOT NULL,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hide_on_ios" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banners_active_sort_order_idx" ON "banners"("active", "sort_order");

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "banners" ADD CONSTRAINT "banners_check" CHECK (
  jsonb_typeof("title") = 'object'
  AND ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at")
  AND (("link_type" = 'none') = ("link_value" = ''))
  AND ("link_type" <> 'url' OR "link_value" LIKE 'https://%')
);
