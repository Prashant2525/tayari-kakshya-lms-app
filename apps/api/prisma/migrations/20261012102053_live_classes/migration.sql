-- CreateEnum
CREATE TYPE "LiveProvider" AS ENUM ('youtube', 'zoom');

-- CreateEnum
CREATE TYPE "LiveStatus" AS ENUM ('scheduled', 'live', 'ended', 'cancelled');

-- CreateTable
CREATE TABLE "live_classes" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "provider" "LiveProvider" NOT NULL,
    "join_url" TEXT NOT NULL,
    "passcode" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "access_level" "AccessLevel" NOT NULL,
    "instructor_id" UUID,
    "status" "LiveStatus" NOT NULL DEFAULT 'scheduled',
    "published_at" TIMESTAMPTZ(6),
    "reminded_for" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "recording_video_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "live_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_attendance" (
    "live_class_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joins" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "live_attendance_pkey" PRIMARY KEY ("live_class_id","user_id")
);

-- CreateIndex
CREATE INDEX "live_classes_course_id_starts_at_idx" ON "live_classes"("course_id", "starts_at");

-- CreateIndex
CREATE INDEX "live_classes_status_starts_at_idx" ON "live_classes"("status", "starts_at");

-- CreateIndex
CREATE INDEX "live_attendance_user_id_idx" ON "live_attendance"("user_id");

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_recording_video_id_fkey" FOREIGN KEY ("recording_video_id") REFERENCES "video_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_live_class_id_fkey" FOREIGN KEY ("live_class_id") REFERENCES "live_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- D-072: the rules the API also checks, kept by the database.
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_duration_check" CHECK ("duration_minutes" BETWEEN 5 AND 600);
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_join_url_check" CHECK ("join_url" LIKE 'https://%');
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_passcode_check" CHECK ("passcode" IS NULL OR "provider" = 'zoom');
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_joins_check" CHECK ("joins" >= 1);
