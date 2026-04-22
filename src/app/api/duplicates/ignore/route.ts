import { prisma } from "@/lib/db";
import { requireAuthedContext, requireRole } from "@/lib/authz";

export async function POST(req: Request) {
  try {
    const ctx = await requireAuthedContext();
    requireRole(ctx, "editor");

    const body = (await req.json().catch(() => null)) as null | { ignoreKeys?: string[] };
    const ignoreKeys = Array.from(new Set((body?.ignoreKeys ?? []).map(String))).filter(Boolean).slice(0, 500);

    for (const k of ignoreKeys) {
      const [kind, ...rest] = k.split(":");
      const value = rest.join(":");
      if (!value) continue;
      if (kind !== "amount" && kind !== "datetime") continue;
      await prisma.duplicateIgnore.upsert({
        where: { householdId_kind_value: { householdId: ctx.householdId, kind, value } },
        create: { householdId: ctx.householdId, userId: ctx.userId, kind, value },
        update: {},
      });
    }

    return Response.json({ ok: true, ignored: ignoreKeys.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

