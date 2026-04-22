-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accent" TEXT,
ADD COLUMN     "carryoverEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "carryoverNote" TEXT,
ADD COLUMN     "summaryOrder" TEXT NOT NULL DEFAULT 'expense_first',
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN     "transactionSort" TEXT NOT NULL DEFAULT 'date_desc';
