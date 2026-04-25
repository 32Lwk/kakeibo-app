import { prisma } from "@/lib/db";
import { requireAuthedContext, scopedTx } from "@/lib/authz";

export const dynamic = "force-dynamic";

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function escapeCsv(value: string) {
  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export async function GET(req: Request) {
  const ctx = await requireAuthedContext().catch(() => null);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const txWhere = scopedTx(ctx);

  const url = new URL(req.url);
  const from = url.searchParams.get("from"); // YYYY-MM-DD
  const to = url.searchParams.get("to"); // YYYY-MM-DD (inclusive)
  const fromDate = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(from) : null;
  const toDate = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(to) : null;
  const endExclusive = toDate ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1) : null;

  const txs = await prisma.transaction.findMany({
    where: {
      ...txWhere,
      ...(fromDate || endExclusive
        ? {
            purchaseDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(endExclusive ? { lt: endExclusive } : {}),
            },
          }
        : {}),
    },
    orderBy: { purchaseDate: "asc" },
    select: {
      purchaseDate: true,
      type: true,
      totalAmount: true,
      memo: true,
      splits: {
        take: 1,
        select: { category: { select: { name: true } } },
      },
    },
  });

  const header = ["金額", "日付", "メモ", "カテゴリー名"].join(",");
  const lines = txs.map((t) => {
    const signed = t.type === "expense" ? -t.totalAmount : t.totalAmount;
    const memo = t.memo ?? "";
    const categoryName = t.splits[0]?.category?.name ?? "";
    return [
      String(signed),
      toYmd(t.purchaseDate),
      escapeCsv(memo),
      escapeCsv(categoryName),
    ].join(",");
  });

  const csv = [header, ...lines].join("\n");
  const now = new Date();
  const filename = `kakeibo_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}.csv`;

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

