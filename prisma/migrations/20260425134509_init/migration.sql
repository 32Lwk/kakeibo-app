-- CreateEnum
CREATE TYPE "DuplicateIgnoreKind" AS ENUM ('amount', 'datetime');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recurringAutoApply" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "DuplicateIgnore" (
    "id" TEXT NOT NULL,
    "kind" "DuplicateIgnoreKind" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DuplicateIgnore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuplicateIgnore_householdId_createdAt_idx" ON "DuplicateIgnore"("householdId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateIgnore_householdId_kind_value_key" ON "DuplicateIgnore"("householdId", "kind", "value");

-- AddForeignKey
ALTER TABLE "DuplicateIgnore" ADD CONSTRAINT "DuplicateIgnore_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateIgnore" ADD CONSTRAINT "DuplicateIgnore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Transaction_householdId_layerId_generatedKind_generatedMonth_ge" RENAME TO "Transaction_householdId_layerId_generatedKind_generatedMont_key";
