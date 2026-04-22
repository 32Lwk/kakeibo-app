import { prisma } from "@/lib/db";
import { requireAuthedContext } from "@/lib/authz";
import { deleteStoredObject, readStoredObject } from "@/lib/storage";
import { receiptImageKeep, receiptImageRetentionDays } from "@/lib/guardrails";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthedContext().catch(() => null);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const att = await prisma.attachment.findFirst({
    where: { id, householdId: ctx.householdId },
    select: { mimeType: true, gcsObjectKey: true, fileName: true, createdAt: true },
  });
  if (!att) return new Response("Not found", { status: 404 });

  if (receiptImageKeep() && receiptImageRetentionDays() > 0) {
    const days = receiptImageRetentionDays();
    const expiresAt = new Date(att.createdAt);
    expiresAt.setDate(expiresAt.getDate() + days);
    if (Date.now() > expiresAt.getTime()) {
      await deleteStoredObject(att.gcsObjectKey);
      await prisma.attachment.deleteMany({ where: { householdId: ctx.householdId, gcsObjectKey: att.gcsObjectKey } });
      return new Response("Gone", { status: 410 });
    }
  }

  const obj = await readStoredObject(att.gcsObjectKey).catch(() => null);
  if (!obj) return new Response("Not found", { status: 404 });

  return new Response(obj.bytes, {
    headers: {
      "content-type": att.mimeType || "application/octet-stream",
      "content-disposition": att.fileName ? `inline; filename="${att.fileName}"` : "inline",
      "cache-control": "private, max-age=60",
    },
  });
}

