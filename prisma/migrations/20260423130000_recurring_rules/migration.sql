-- CreateEnum
CREATE TYPE "GeneratedKind" AS ENUM ('recurring', 'carryover_account', 'carryover_category');

-- CreateTable
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

-- AlterTable
ALTER TABLE "Transaction"
  ADD COLUMN "generatedKind" "GeneratedKind",
  ADD COLUMN "generatedMonth" TEXT,
  ADD COLUMN "generatedKey" TEXT,
  ADD COLUMN "recurringRuleId" TEXT;

-- CreateIndex (pre-household_layers shape; household_layers migration will replace it)
CREATE UNIQUE INDEX "Transaction_householdId_generatedKind_generatedMonth_generatedKey_key"
  ON "Transaction"("householdId", "generatedKind", "generatedMonth", "generatedKey");

-- CreateIndex
CREATE INDEX "RecurringRule_householdId_isActive_idx" ON "RecurringRule"("householdId", "isActive");

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringRuleId_fkey"
  FOREIGN KEY ("recurringRuleId") REFERENCES "RecurringRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

