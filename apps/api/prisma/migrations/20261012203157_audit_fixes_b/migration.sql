-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'change_email';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_key" TEXT;

-- CreateTable
CREATE TABLE "notice_attachments" (
    "notice_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "notice_attachments_pkey" PRIMARY KEY ("notice_id","media_id")
);

-- CreateIndex
CREATE INDEX "notice_attachments_media_id_idx" ON "notice_attachments"("media_id");

-- AddForeignKey
ALTER TABLE "notice_attachments" ADD CONSTRAINT "notice_attachments_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_attachments" ADD CONSTRAINT "notice_attachments_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
