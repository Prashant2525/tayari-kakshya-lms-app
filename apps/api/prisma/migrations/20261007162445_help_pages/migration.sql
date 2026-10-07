-- CreateEnum
CREATE TYPE "StaticPageSlug" AS ENUM ('about', 'terms', 'privacy', 'refund');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('phone', 'whatsapp', 'viber', 'email', 'website', 'facebook', 'address');

-- CreateTable
CREATE TABLE "static_pages" (
    "slug" "StaticPageSlug" NOT NULL,
    "title" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "static_pages_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "static_page_versions" (
    "id" UUID NOT NULL,
    "slug" "StaticPageSlug" NOT NULL,
    "version" INTEGER NOT NULL,
    "title" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID NOT NULL,

    CONSTRAINT "static_page_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" UUID NOT NULL,
    "question" JSONB NOT NULL,
    "answer" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hide_on_ios" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_options" (
    "id" UUID NOT NULL,
    "type" "ContactType" NOT NULL,
    "label" JSONB NOT NULL,
    "value" TEXT NOT NULL,
    "note" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contact_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "static_page_versions_slug_version_key" ON "static_page_versions"("slug", "version");

-- CreateIndex
CREATE INDEX "faqs_sort_order_idx" ON "faqs"("sort_order");

-- CreateIndex
CREATE INDEX "contact_options_sort_order_idx" ON "contact_options"("sort_order");

-- AddForeignKey
ALTER TABLE "static_page_versions" ADD CONSTRAINT "static_page_versions_slug_fkey" FOREIGN KEY ("slug") REFERENCES "static_pages"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A published version is a record of what readers were shown (legal pages): never changed or deleted.
CREATE FUNCTION static_page_versions_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Published page versions cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER static_page_versions_immutable BEFORE UPDATE OR DELETE ON "static_page_versions"
  FOR EACH ROW EXECUTE FUNCTION static_page_versions_immutable();

ALTER TABLE "static_page_versions" ADD CONSTRAINT "static_page_versions_check"
  CHECK ("version" >= 1 AND jsonb_typeof("title") = 'object' AND jsonb_typeof("body") = 'object');
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_text_check"
  CHECK (jsonb_typeof("question") = 'object' AND jsonb_typeof("answer") = 'object');
ALTER TABLE "contact_options" ADD CONSTRAINT "contact_options_value_check"
  CHECK (length("value") BETWEEN 1 AND 300 AND jsonb_typeof("label") = 'object');
