-- CreateEnum
CREATE TYPE "CertificateLanguage" AS ENUM ('en', 'ne');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "certificate_template_id" UUID;

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "language" "CertificateLanguage" NOT NULL DEFAULT 'en',
    "required_percent" INTEGER NOT NULL,
    "title" JSONB NOT NULL,
    "intro" JSONB,
    "statement" JSONB NOT NULL,
    "issuer_name" JSONB NOT NULL,
    "signatories" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revoke_reason" TEXT,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_code_key" ON "certificates"("code");

-- CreateIndex
CREATE INDEX "certificates_course_id_issued_at_idx" ON "certificates"("course_id", "issued_at" DESC);

-- CreateIndex
CREATE INDEX "certificates_template_id_idx" ON "certificates"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_user_id_course_id_key" ON "certificates"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "courses_certificate_template_id_idx" ON "courses"("certificate_template_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_certificate_template_id_fkey" FOREIGN KEY ("certificate_template_id") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rules the database itself enforces.
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_required_percent_check" CHECK ("required_percent" BETWEEN 1 AND 100);
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_code_check" CHECK ("code" ~ '^[0-9A-HJKMNP-TV-Z]{12}$');
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revoked_check" CHECK (("revoked_at" IS NULL) = ("revoke_reason" IS NULL));
