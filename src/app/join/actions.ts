"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export type AcceptInviteState = { ok: false; message: string } | { ok: true; message?: string };

export async function acceptHouseholdInvite(token: string): Promise<AcceptInviteState> {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return { ok: false, message: "ログインが必要です。" };
  }

  const trimmed = token.trim();
  if (!trimmed) return { ok: false, message: "招待リンクが無効です。" };

  const invite = await prisma.householdInvite.findUnique({
    where: { token: trimmed },
    include: { household: { select: { id: true, name: true } } },
  });

  if (!invite) return { ok: false, message: "招待が見つかりません。リンクの有効期限が切れている可能性があります。" };
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, message: "この招待の有効期限が切れています。オーナーに新しいリンクを発行してもらってください。" };
  }

  const firstLayer = await prisma.householdLayer.findFirst({
    where: { householdId: invite.householdId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!firstLayer) {
    return { ok: false, message: "この家計簿にレイヤーが設定されていません。管理者に連絡してください。" };
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_householdId: { userId, householdId: invite.householdId } },
  });

  if (existing) {
    // 既に参加済みでも、この家計簿を「表示対象」に切り替えられるようにする
    await prisma.user.update({
      where: { id: userId },
      data: {
        preferredHouseholdId: invite.householdId,
        preferredLayerId: firstLayer.id,
      },
    });
    return { ok: true, message: "すでに参加済みです（表示対象をこの家計簿に切り替えました）。" };
  } else {
    await prisma.householdJoinRequest.upsert({
      where: {
        householdId_userId_status: {
          householdId: invite.householdId,
          userId,
          status: "pending",
        },
      },
      create: {
        householdId: invite.householdId,
        userId,
        status: "pending",
        requestedRole: invite.role,
        inviteToken: invite.token,
      },
      update: {
        requestedRole: invite.role,
        inviteToken: invite.token,
      },
    });
    return { ok: true };
  }
}
