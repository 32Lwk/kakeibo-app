-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "HouseholdJoinRequest" (
    "id" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'pending',
    "requestedRole" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "inviteToken" TEXT,

    CONSTRAINT "HouseholdJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HouseholdJoinRequest_householdId_status_createdAt_idx" ON "HouseholdJoinRequest"("householdId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdJoinRequest_householdId_userId_status_key" ON "HouseholdJoinRequest"("householdId", "userId", "status");

-- AddForeignKey
ALTER TABLE "HouseholdJoinRequest" ADD CONSTRAINT "HouseholdJoinRequest_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdJoinRequest" ADD CONSTRAINT "HouseholdJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdJoinRequest" ADD CONSTRAINT "HouseholdJoinRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

