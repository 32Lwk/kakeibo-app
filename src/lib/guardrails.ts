import { prisma } from "@/lib/db";

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function getAiCallLimitPerMonth() {
  const raw = process.env.AI_CALL_LIMIT_PER_MONTH;
  const n = raw ? Math.trunc(Number(raw)) : 60;
  return Number.isFinite(n) && n >= 0 ? n : 60;
}

export async function assertAiBudgetForUser(userId: string) {
  const limit = getAiCallLimitPerMonth();
  if (limit === 0) throw new Error("解析は無効化されています。");

  const since = monthStart();
  const used = await prisma.auditLog.count({
    where: {
      userId,
      action: "analyze",
      entityType: "receipt",
      createdAt: { gte: since },
    },
  });
  if (used >= limit) {
    throw new Error("今月の解析上限に達しました。来月までお待ちください。");
  }
}

export function receiptImageKeep() {
  const raw = (process.env.RECEIPT_IMAGE_KEEP ?? "true").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function receiptImageRetentionDays() {
  const raw = process.env.RECEIPT_IMAGE_RETENTION_DAYS;
  const n = raw ? Math.trunc(Number(raw)) : 30;
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

