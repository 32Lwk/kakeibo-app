import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { MembershipRole } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type AuthedContext = {
  userId: string;
  householdId: string;
  role: MembershipRole;
  /** ダッシュボード・明細などで扱うレイヤー */
  activeLayerId: string;
};

/** 明細（Transaction）の household + 現在レイヤー絞り込み */
export function scopedTx(ctx: AuthedContext) {
  return { householdId: ctx.householdId, layerId: ctx.activeLayerId };
}

const roleRank: Record<MembershipRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export function hasRoleAtLeast(role: MembershipRole, min: MembershipRole) {
  return roleRank[role] >= roleRank[min];
}

export async function requireAuthedContext(
  opts?: { onUnauthorized?: "throw" | "redirect"; callbackUrl?: string },
): Promise<AuthedContext> {
  const onUnauthorized = opts?.onUnauthorized ?? "throw";
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    if (onUnauthorized === "redirect") {
      const h = await headers();
      const pathname = h.get("x-pathname") || h.get("x-invoke-path") || "/dashboard";
      const search = h.get("x-search") || "";
      const path = opts?.callbackUrl || `${pathname}${search}`;
      redirect(`/login?callbackUrl=${encodeURIComponent(path)}`);
    }
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredHouseholdId: true, preferredLayerId: true },
  });

  const preferredId = user?.preferredHouseholdId;
  if (preferredId) {
    const preferred = await prisma.membership.findUnique({
      where: { userId_householdId: { userId, householdId: preferredId } },
      select: { householdId: true, role: true },
    });
    if (preferred) {
      const activeLayerId = await resolveActiveLayerId(preferred.householdId, user?.preferredLayerId);
      return {
        userId,
        householdId: preferred.householdId,
        role: preferred.role,
        activeLayerId,
      };
    }
  }

  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { householdId: true, role: true },
  });
  if (!membership) throw new Error("No household");

  const activeLayerId = await resolveActiveLayerId(membership.householdId, user?.preferredLayerId);
  return {
    userId,
    householdId: membership.householdId,
    role: membership.role,
    activeLayerId,
  };
}

async function resolveActiveLayerId(
  householdId: string,
  preferredLayerId: string | null | undefined,
): Promise<string> {
  const layers = await prisma.householdLayer.findMany({
    where: { householdId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!layers.length) throw new Error("No household layers");
  if (preferredLayerId && layers.some((l) => l.id === preferredLayerId)) return preferredLayerId;
  return layers[0].id;
}

export function requireRole(ctx: AuthedContext, min: MembershipRole) {
  if (!hasRoleAtLeast(ctx.role, min)) {
    throw new Error("Forbidden");
  }
}

