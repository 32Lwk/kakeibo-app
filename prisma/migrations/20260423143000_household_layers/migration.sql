-- CreateTable
CREATE TABLE "HouseholdLayer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "householdId" TEXT NOT NULL,

    CONSTRAINT "HouseholdLayer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HouseholdLayer_householdId_sortOrder_idx" ON "HouseholdLayer"("householdId", "sortOrder");

ALTER TABLE "HouseholdLayer" ADD CONSTRAINT "HouseholdLayer_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Safety: RecurringRule table may not exist in older migration chains
DO $$
BEGIN
  IF to_regclass('public."RecurringRule"') IS NULL THEN
    CREATE TABLE "RecurringRule" (
        "id" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "type" "TransactionType" NOT NULL,
        "dayOfMonth" INTEGER NOT NULL,
        "amount" INTEGER NOT NULL,
        "memo" TEXT,
        "accountType" TEXT,
        "startMonth" TEXT NOT NULL DEFAULT '1970-01',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "householdId" TEXT NOT NULL,
        "categoryId" TEXT,

        CONSTRAINT "RecurringRule_pkey" PRIMARY KEY ("id")
    );

    CREATE INDEX "RecurringRule_householdId_isActive_idx" ON "RecurringRule"("householdId", "isActive");

    ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_householdId_fkey"
      FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "preferredLayerId" TEXT;

-- One default layer per household
INSERT INTO "HouseholdLayer" ("id", "name", "sortOrder", "createdAt", "householdId")
SELECT 'lay_' || replace(gen_random_uuid()::text, '-', ''), 'メイン', 0, CURRENT_TIMESTAMP, h.id
FROM "Household" h;

ALTER TABLE "Transaction" ADD COLUMN "layerId" TEXT;
ALTER TABLE "RecurringRule" ADD COLUMN "layerId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "layerId" TEXT;

UPDATE "Transaction" t SET "layerId" = (
  SELECT l.id FROM "HouseholdLayer" l WHERE l."householdId" = t."householdId" ORDER BY l."sortOrder" ASC, l."createdAt" ASC LIMIT 1
);

UPDATE "RecurringRule" r SET "layerId" = (
  SELECT l.id FROM "HouseholdLayer" l WHERE l."householdId" = r."householdId" ORDER BY l."sortOrder" ASC, l."createdAt" ASC LIMIT 1
);

UPDATE "Receipt" r SET "layerId" = (
  SELECT l.id FROM "HouseholdLayer" l WHERE l."householdId" = r."householdId" ORDER BY l."sortOrder" ASC, l."createdAt" ASC LIMIT 1
);

ALTER TABLE "Transaction" ALTER COLUMN "layerId" SET NOT NULL;
ALTER TABLE "RecurringRule" ALTER COLUMN "layerId" SET NOT NULL;
ALTER TABLE "Receipt" ALTER COLUMN "layerId" SET NOT NULL;

-- Compatibility: this migration expects generated* columns (added in 20260423130000_recurring_rules),
-- but shadow DB chains can be missing them due to drift/branching. Ensure they exist before indexing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GeneratedKind') THEN
    CREATE TYPE "GeneratedKind" AS ENUM ('recurring', 'carryover_account', 'carryover_category');
  END IF;
END $$;

ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "generatedKind" "GeneratedKind",
  ADD COLUMN IF NOT EXISTS "generatedMonth" TEXT,
  ADD COLUMN IF NOT EXISTS "generatedKey" TEXT;

DROP INDEX IF EXISTS "Transaction_householdId_generatedKind_generatedMonth_generatedKey_key";

CREATE UNIQUE INDEX "Transaction_householdId_layerId_generatedKind_generatedMonth_generatedKey_key" ON "Transaction"("householdId", "layerId", "generatedKind", "generatedMonth", "generatedKey");

DROP INDEX IF EXISTS "Transaction_householdId_purchaseDate_idx";
CREATE INDEX "Transaction_householdId_layerId_purchaseDate_idx" ON "Transaction"("householdId", "layerId", "purchaseDate");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "HouseholdLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "HouseholdLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "HouseholdLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "RecurringRule_householdId_isActive_idx";
CREATE INDEX "RecurringRule_householdId_layerId_isActive_idx" ON "RecurringRule"("householdId", "layerId", "isActive");

DROP INDEX IF EXISTS "Receipt_householdId_createdAt_idx";
CREATE INDEX "Receipt_householdId_layerId_createdAt_idx" ON "Receipt"("householdId", "layerId", "createdAt");

WITH um AS (
  SELECT DISTINCT ON (m."userId") m."userId", m."householdId"
  FROM "Membership" m
  ORDER BY m."userId", m."createdAt" ASC
)
UPDATE "User" u
SET "preferredLayerId" = sub.lid
FROM (
  SELECT um."userId" AS uid,
    (SELECT l.id FROM "HouseholdLayer" l WHERE l."householdId" = um."householdId" ORDER BY l."sortOrder" ASC, l."createdAt" ASC LIMIT 1) AS lid
  FROM um
) sub
WHERE u.id = sub.uid AND sub.lid IS NOT NULL AND u."preferredLayerId" IS NULL;
