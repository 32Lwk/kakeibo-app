import { prisma } from "@/lib/db";
import { requireAuthedContext, requireRole } from "@/lib/authz";

export async function POST(req: Request) {
  try {
    const ctx = await requireAuthedContext();
    requireRole(ctx, "editor");

    const body = (await req.json().catch(() => null)) as null | { ids?: string[] };
    const ids = Array.from(new Set((body?.ids ?? []).map(String))).filter(Boolean).slice(0, 500);
    if (ids.length === 0) return Response.json({ ok: false, error: "ids is required" }, { status: 400 });

    // only within household
    const found = await prisma.transaction.findMany({
      where: { householdId: ctx.householdId, id: { in: ids } },
      select: { id: true },
    });
    const foundIds = found.map((t) => t.id);
    if (foundIds.length === 0) return Response.json({ ok: true, deleted: 0 });

    const res = await prisma.transaction.deleteMany({
      where: { householdId: ctx.householdId, id: { in: foundIds } },
    });

    await prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "delete",
        entityType: "transactions",
        entityId: ctx.householdId,
        metadata: { deletedCount: res.count, ids: foundIds.slice(0, 50), reason: "duplicates_ui" },
      },
    });

    return Response.json({ ok: true, deleted: res.count });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

