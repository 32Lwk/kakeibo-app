import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { MembershipRole } from "@prisma/client";

export type AuthedContext = {
  userId: string;
  householdId: string;
  role: MembershipRole;
};

const roleRank: Record<MembershipRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export function hasRoleAtLeast(role: MembershipRole, min: MembershipRole) {
  return roleRank[role] >= roleRank[min];
}

export async function requireAuthedContext(): Promise<AuthedContext> {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  // MVP: first household is the active household.
  // When household switching is introduced, centralize selection here.
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { householdId: true, role: true },
  });
  if (!membership) throw new Error("No household");

  return { userId, householdId: membership.householdId, role: membership.role };
}

export function requireRole(ctx: AuthedContext, min: MembershipRole) {
  if (!hasRoleAtLeast(ctx.role, min)) {
    throw new Error("Forbidden");
  }
}

