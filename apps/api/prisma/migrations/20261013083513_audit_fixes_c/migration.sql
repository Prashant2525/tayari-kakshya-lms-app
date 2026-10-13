-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'cancelled');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'announcement';

-- CreateTable
CREATE TABLE "notification_campaigns" (
    "id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "message" JSONB NOT NULL,
    "audience" JSONB NOT NULL,
    "link" JSONB,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "exclude_ios" BOOLEAN NOT NULL DEFAULT false,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "send_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_campaigns_status_send_at_idx" ON "notification_campaigns"("status", "send_at");

-- CreateIndex
CREATE INDEX "notification_campaigns_created_at_idx" ON "notification_campaigns"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "notification_campaigns" ADD CONSTRAINT "notification_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Campaign rules the database keeps (D-075): localized text objects, a known audience shape, a scheduled campaign has
-- its time, a sent one its sent time (and only then), recipients never negative, a sent campaign is never deleted.
ALTER TABLE "notification_campaigns"
  ADD CONSTRAINT "notification_campaigns_text_chk" CHECK (jsonb_typeof("title") = 'object' AND jsonb_typeof("message") = 'object'),
  ADD CONSTRAINT "notification_campaigns_audience_chk" CHECK ("audience"->>'type' IN ('all', 'courses', 'exam_nodes')),
  ADD CONSTRAINT "notification_campaigns_scheduled_chk" CHECK ("status" <> 'scheduled' OR "send_at" IS NOT NULL),
  ADD CONSTRAINT "notification_campaigns_sent_chk" CHECK (("status" = 'sent') = ("sent_at" IS NOT NULL)),
  ADD CONSTRAINT "notification_campaigns_recipients_chk" CHECK ("recipients" >= 0),
  ADD CONSTRAINT "notification_campaigns_kept_chk" CHECK ("deleted_at" IS NULL OR "status" IN ('draft', 'cancelled'));
