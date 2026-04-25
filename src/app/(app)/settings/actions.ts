"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuthedContext, requireRole } from "@/lib/authz";
import type { MembershipRole } from "@prisma/client";
import { getGoogleAccessTokenForUser } from "@/lib/googleOAuth";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function updateProfileDisplayName(formData: FormData) {
  const ctx = await requireAuthedContext();
  const raw = String(formData.get("displayName") ?? "").trim();
  const name = raw.length > 0 ? raw.slice(0, 80) : null;

  await prisma.user.update({
    where: { id: ctx.userId },
    data: { name },
  });
  revalidatePath("/settings");
  redirect("/settings");
}

export async function updateProfileImage(formData: FormData) {
  const ctx = await requireAuthedContext();
  const raw = String(formData.get("imageUrl") ?? "").trim();
  const image = raw.length > 0 ? raw.slice(0, 500) : null;
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { image },
  });
  revalidatePath("/settings");
  redirect("/settings");
}

export async function uploadProfileImage(formData: FormData) {
  const ctx = await requireAuthedContext();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("画像ファイルを選択してください。");
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルのみ対応しています。");
  if (file.size > 5 * 1024 * 1024) throw new Error("画像サイズが大きすぎます（最大5MB）。");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { saveUpload } = await import("@/lib/storage");
  const { key } = await saveUpload({
    folder: `profile_${ctx.userId}`,
    fileName: `${Date.now()}_${file.name}`,
    bytes,
  });

  const att = await prisma.attachment.create({
    data: {
      householdId: ctx.householdId,
      kind: "profile",
      mimeType: file.type,
      fileName: file.name,
      gcsObjectKey: key,
    },
    select: { id: true },
  });

  // 旧プロフィール画像が /attachments/... の場合は、可能なら削除する（ベストエフォート）
  const old = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { image: true } });
  const oldId = (old?.image ?? "").startsWith("/attachments/") ? (old!.image!.split("/").pop() ?? "") : "";
  if (oldId) {
    const oldAtt = await prisma.attachment.findFirst({
      where: { id: oldId, householdId: ctx.householdId, kind: "profile" },
      select: { id: true, gcsObjectKey: true },
    });
    if (oldAtt) {
      const { deleteStoredObject } = await import("@/lib/storage");
      await deleteStoredObject(oldAtt.gcsObjectKey);
      await prisma.attachment.delete({ where: { id: oldAtt.id } }).catch(() => null);
    }
  }

  await prisma.user.update({
    where: { id: ctx.userId },
    data: { image: `/attachments/${att.id}` },
  });

  revalidatePath("/settings");
  redirect("/settings");
}

export async function uploadProfileImageFromGooglePhotos(formData: FormData) {
  const ctx = await requireAuthedContext();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim();
  const fileNameRaw = String(formData.get("fileName") ?? "google-photos.jpg").trim();

  if (!baseUrl) throw new Error("Googleフォトの画像情報が不足しています。");

  // クライアントに access_token を持たせない（NextAuth のGoogle連携からサーバ側で取得/更新する）
  const accessToken = await getGoogleAccessTokenForUser(ctx.userId);

  // アバター用途のため縮小してダウンロード（最大5MB制限にも有利）
  const contentUrl = `${baseUrl}=w1024-h1024`;
  const res = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Googleフォトの画像取得に失敗しました。");

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > 5 * 1024 * 1024) throw new Error("画像サイズが大きすぎます（最大5MB）。");
  const bytes = new Uint8Array(arrayBuffer);

  const mimeType = (res.headers.get("content-type") ?? "image/jpeg").slice(0, 200);
  if (!mimeType.startsWith("image/")) throw new Error("画像ファイルのみ対応しています。");

  const safeFileName = fileNameRaw.length ? fileNameRaw.slice(0, 120) : "google-photos.jpg";
  const { saveUpload } = await import("@/lib/storage");
  const { key } = await saveUpload({
    folder: `profile_${ctx.userId}`,
    fileName: `${Date.now()}_${safeFileName}`,
    bytes,
  });

  const att = await prisma.attachment.create({
    data: {
      householdId: ctx.householdId,
      kind: "profile",
      mimeType,
      fileName: safeFileName,
      gcsObjectKey: key,
    },
    select: { id: true },
  });

  // 旧プロフィール画像が /attachments/... の場合は、可能なら削除する（ベストエフォート）
  const old = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { image: true } });
  const oldId = (old?.image ?? "").startsWith("/attachments/") ? (old!.image!.split("/").pop() ?? "") : "";
  if (oldId) {
    const oldAtt = await prisma.attachment.findFirst({
      where: { id: oldId, householdId: ctx.householdId, kind: "profile" },
      select: { id: true, gcsObjectKey: true },
    });
    if (oldAtt) {
      const { deleteStoredObject } = await import("@/lib/storage");
      await deleteStoredObject(oldAtt.gcsObjectKey);
      await prisma.attachment.delete({ where: { id: oldAtt.id } }).catch(() => null);
    }
  }

  await prisma.user.update({
    where: { id: ctx.userId },
    data: { image: `/attachments/${att.id}` },
  });

  revalidatePath("/settings");
  redirect("/settings");
}

export async function exchangeGoogleAuthCodeForPhotosAccessToken(formData: FormData) {
  await requireAuthedContext();
  const code = String(formData.get("code") ?? "").trim();
  const redirectUri = String(formData.get("redirectUri") ?? "").trim();
  if (!code) throw new Error("Googleの認可コードがありません。");
  if (!redirectUri) throw new Error("redirectUri がありません。");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が設定されていません。");

  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", redirectUri);
  body.set("grant_type", "authorization_code");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Googleトークン取得に失敗しました。");
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Googleトークン取得に失敗しました。");

  // クライアントに返す（server action の戻り値として）
  return { accessToken: json.access_token, expiresIn: typeof json.expires_in === "number" ? json.expires_in : null };
}

export async function updateHouseholdName(formData: FormData) {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "owner");
  const raw = String(formData.get("householdName") ?? "").trim();
  if (!raw) throw new Error("家計簿名を入力してください。");
  const name = raw.slice(0, 80);

  await prisma.household.update({
    where: { id: ctx.householdId },
    data: { name },
  });
  revalidatePath("/settings");
  redirect("/settings");
}

export async function createHouseholdInviteLink(role: MembershipRole) {
  let ctx: Awaited<ReturnType<typeof requireAuthedContext>>;
  try {
    ctx = await requireAuthedContext();
  } catch {
    redirect(`/login?callbackUrl=${encodeURIComponent("/settings")}`);
  }
  requireRole(ctx, "owner");

  if (!["editor", "viewer"].includes(role)) {
    throw new Error("招待できる権限は編集者または閲覧のみです。");
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await prisma.householdInvite.create({
    data: {
      token,
      householdId: ctx.householdId,
      role,
      createdByUserId: ctx.userId,
      expiresAt,
    },
  });

  const base =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}/join?invite=${encodeURIComponent(token)}`;
}

export async function revokeHouseholdInvite(formData: FormData) {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "owner");
  const id = String(formData.get("inviteId") ?? "").trim();
  if (!id) throw new Error("不正な入力です。");
  const invite = await prisma.householdInvite.findFirst({
    where: { id, householdId: ctx.householdId },
    select: { id: true },
  });
  if (!invite) throw new Error("招待が見つかりません。");
  await prisma.householdInvite.delete({ where: { id } });
  revalidatePath("/settings");
  redirect("/settings");
}

export async function revokeAllHouseholdInvites() {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "owner");
  await prisma.householdInvite.deleteMany({
    where: { householdId: ctx.householdId },
  });
  revalidatePath("/settings");
  redirect("/settings");
}

export async function updateMemberRole(formData: FormData) {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "owner");
  const userId = String(formData.get("userId") ?? "").trim();
  const rawRole = String(formData.get("role") ?? "").trim() as MembershipRole;
  if (!userId) throw new Error("不正な入力です。");
  if (!["editor", "viewer"].includes(rawRole)) throw new Error("変更できる権限は編集者または閲覧のみです。");
  const membership = await prisma.membership.findUnique({
    where: { userId_householdId: { userId, householdId: ctx.householdId } },
    select: { role: true },
  });
  if (!membership) throw new Error("メンバーが見つかりません。");
  if (membership.role === "owner") throw new Error("オーナーの権限は変更できません。");
  await prisma.membership.update({
    where: { userId_householdId: { userId, householdId: ctx.householdId } },
    data: { role: rawRole },
  });
  revalidatePath("/settings");
  redirect("/settings");
}

export async function removeMember(formData: FormData) {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "owner");
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) throw new Error("不正な入力です。");

  const membership = await prisma.membership.findUnique({
    where: { userId_householdId: { userId, householdId: ctx.householdId } },
    select: { role: true },
  });
  if (!membership) throw new Error("メンバーが見つかりません。");

  if (membership.role === "owner") {
    const owners = await prisma.membership.count({ where: { householdId: ctx.householdId, role: "owner" } });
    if (owners <= 1) throw new Error("最後のオーナーは削除できません。");
  }

  await prisma.membership.delete({
    where: { userId_householdId: { userId, householdId: ctx.householdId } },
  });
  revalidatePath("/settings");
  redirect("/settings");
}

export async function approveJoinRequest(formData: FormData) {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "owner");
  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!requestId) throw new Error("不正な入力です。");

  const req = await prisma.householdJoinRequest.findFirst({
    where: { id: requestId, householdId: ctx.householdId, status: "pending" },
    select: { id: true, userId: true, requestedRole: true, householdId: true },
  });
  if (!req) throw new Error("申請が見つかりません。");

  const firstLayer = await prisma.householdLayer.findFirst({
    where: { householdId: ctx.householdId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!firstLayer) throw new Error("この家計簿にレイヤーが設定されていません。");

  await prisma.$transaction(async (tx) => {
    await tx.membership.upsert({
      where: { userId_householdId: { userId: req.userId, householdId: ctx.householdId } },
      create: { userId: req.userId, householdId: ctx.householdId, role: req.requestedRole },
      update: { role: req.requestedRole },
    });
    await tx.householdJoinRequest.update({
      where: { id: req.id },
      data: { status: "approved", decidedAt: new Date(), decidedByUserId: ctx.userId },
    });
    // 承認された側が次回開いたときに表示されやすいように、初期レイヤーだけ先にセット
    await tx.user.update({
      where: { id: req.userId },
      data: { preferredLayerId: firstLayer.id },
    });
  });

  revalidatePath("/settings");
  redirect("/settings");
}

export async function rejectJoinRequest(formData: FormData) {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "owner");
  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!requestId) throw new Error("不正な入力です。");
  const req = await prisma.householdJoinRequest.findFirst({
    where: { id: requestId, householdId: ctx.householdId, status: "pending" },
    select: { id: true },
  });
  if (!req) throw new Error("申請が見つかりません。");
  await prisma.householdJoinRequest.update({
    where: { id: req.id },
    data: { status: "rejected", decidedAt: new Date(), decidedByUserId: ctx.userId },
  });
  revalidatePath("/settings");
  redirect("/settings");
}

export async function createHouseholdLayer(formData: FormData) {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "owner");
  const raw = String(formData.get("layerName") ?? "").trim();
  if (!raw) throw new Error("レイヤー名を入力してください。");
  const name = raw.slice(0, 40);
  const maxSort = await prisma.householdLayer.aggregate({
    where: { householdId: ctx.householdId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
  await prisma.householdLayer.create({
    data: { householdId: ctx.householdId, name, sortOrder },
  });
  revalidatePath("/settings");
  redirect("/settings");
}

export async function renameHouseholdLayer(formData: FormData) {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "owner");
  const id = String(formData.get("layerId") ?? "").trim();
  const raw = String(formData.get("layerName") ?? "").trim();
  if (!id || !raw) throw new Error("不正な入力です。");
  const layer = await prisma.householdLayer.findFirst({
    where: { id, householdId: ctx.householdId },
  });
  if (!layer) throw new Error("レイヤーが見つかりません。");
  await prisma.householdLayer.update({
    where: { id },
    data: { name: raw.slice(0, 40) },
  });
  revalidatePath("/settings");
  redirect("/settings");
}

export async function deleteHouseholdLayer(formData: FormData) {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "owner");
  const id = String(formData.get("layerId") ?? "").trim();
  if (!id) throw new Error("不正な入力です。");
  const count = await prisma.householdLayer.count({ where: { householdId: ctx.householdId } });
  if (count <= 1) throw new Error("最後のレイヤーは削除できません。");
  const layer = await prisma.householdLayer.findFirst({
    where: { id, householdId: ctx.householdId },
  });
  if (!layer) throw new Error("レイヤーが見つかりません。");
  const [txN, rcN, ruN] = await Promise.all([
    prisma.transaction.count({ where: { layerId: id } }),
    prisma.receipt.count({ where: { layerId: id } }),
    prisma.recurringRule.count({ where: { layerId: id } }),
  ]);
  if (txN + rcN + ruN > 0) {
    throw new Error("このレイヤーに明細・レシート・定期登録があるため削除できません。");
  }
  await prisma.householdLayer.delete({ where: { id } });
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { preferredLayerId: true },
  });
  if (user?.preferredLayerId === id) {
    const first = await prisma.householdLayer.findFirst({
      where: { householdId: ctx.householdId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (first) {
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { preferredLayerId: first.id },
      });
    }
  }
  revalidatePath("/settings");
  redirect("/settings");
}

export async function setPreferredLayerId(layerId: string) {
  const trimmed = layerId.trim();
  if (!trimmed) throw new Error("レイヤーを選択してください。");
  const ctx = await requireAuthedContext();
  const layer = await prisma.householdLayer.findFirst({
    where: { id: trimmed, householdId: ctx.householdId },
    select: { id: true },
  });
  if (!layer) throw new Error("レイヤーが見つかりません。");
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { preferredLayerId: trimmed },
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  redirect("/settings");
}

export async function setPreferredLayerFromForm(formData: FormData) {
  await setPreferredLayerId(String(formData.get("preferredLayerId") ?? ""));
}
