import { prisma } from "@/lib/db";
import { requireAuthedContext } from "@/lib/authz";

export async function GET(req: Request) {
  const ctx = await requireAuthedContext();
  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get("id") ?? "").trim();
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const row = await prisma.import.findFirst({
    where: { id, householdId: ctx.householdId },
    select: { id: true, summary: true, createdAt: true, source: true, fileName: true },
  });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json({
    id: row.id,
    createdAt: row.createdAt,
    source: row.source,
    fileName: row.fileName,
    summary: row.summary ?? null,
  });
}

