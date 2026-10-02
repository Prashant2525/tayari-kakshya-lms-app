-- Category types become admin-managed data (DYNAMIC_ADMIN_AUDIT §4.1).
-- Non-destructive: the column is converted in place, so existing nodes keep their types.

CREATE TABLE "exam_node_types" (
    "key" VARCHAR(40) NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "rank" INTEGER NOT NULL,
    "top_level" BOOLEAN NOT NULL DEFAULT false,
    "can_have_papers" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_node_types_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "exam_node_types_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]{1,39}$'),
    CONSTRAINT "exam_node_types_rank_check" CHECK ("rank" BETWEEN 1 AND 1000)
);

-- The five existing types keep their order; sub-group and exam stage are added (owner request 2026-10-03).
-- Ranks leave gaps so admins can insert new types between them.
INSERT INTO "exam_node_types" ("key", "name", "rank", "top_level", "can_have_papers") VALUES
  ('authority',  '{"en": "Authority", "ne": "निकाय"}',        10, true,  false),
  ('level',      '{"en": "Level", "ne": "तह"}',               20, false, false),
  ('service',    '{"en": "Service", "ne": "सेवा"}',            30, false, false),
  ('group',      '{"en": "Group", "ne": "समूह"}',              40, false, false),
  ('sub_group',  '{"en": "Sub-group", "ne": "उपसमूह"}',        50, false, false),
  ('post',       '{"en": "Post", "ne": "पद"}',                 60, false, true),
  ('exam_stage', '{"en": "Exam stage", "ne": "परीक्षा चरण"}',  70, false, true);

ALTER TABLE "exam_nodes"
  ALTER COLUMN "node_type" TYPE VARCHAR(40) USING "node_type"::text;

ALTER TABLE "exam_nodes" ADD CONSTRAINT "exam_nodes_node_type_fkey"
  FOREIGN KEY ("node_type") REFERENCES "exam_node_types"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "exam_nodes_node_type_idx" ON "exam_nodes" ("node_type");

DROP TYPE "ExamNodeType";
