import { prisma } from "@/lib/db";
import { requireAuthedContext, scopedTx } from "@/lib/authz";
import { ensureGeneratedForMonth } from "@/lib/monthGeneration";

export const dynamic = "force-dynamic";

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

function parseMonth(searchParams: Record<string, string | string[] | undefined> | undefined) {
  const now = new Date();
  const raw = searchParams?.month;
  const month = Array.isArray(raw) ? raw[0] : raw;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  }
  const [y, m] = month.split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  }
  return { year: y, monthIndex: m - 1 };
}

function firstString(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function clampDayString(day: string | undefined) {
  if (!day) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(day);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAuthedContext({ onUnauthorized: "redirect" });
  const txWhere = scopedTx(ctx);

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { transactionSort: true },
  });
  if (!user) return null;

  const unwrappedSearchParams = searchParams ? await searchParams : undefined;
  const q = (firstString(unwrappedSearchParams?.q) ?? "").trim();
  const day = firstString(unwrappedSearchParams?.day);
  const dayDate = clampDayString(day);
  await ensureGeneratedForMonth({
    prisma,
    userId: ctx.userId,
    householdId: ctx.householdId,
    month: typeof unwrappedSearchParams?.month === "string" ? unwrappedSearchParams.month : undefined,
  });
  const { year, monthIndex } = parseMonth(unwrappedSearchParams);
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 1);
  const start = dayDate ? new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()) : monthStart;
  const end = dayDate ? new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate() + 1) : monthEnd;

  const orderBy =
    user.transactionSort === "date_asc"
      ? ({ purchaseDate: "asc" } as const)
      : user.transactionSort === "amount_desc"
        ? ({ totalAmount: "desc" } as const)
        : user.transactionSort === "amount_asc"
          ? ({ totalAmount: "asc" } as const)
          : ({ purchaseDate: "desc" } as const);

  const txs = await prisma.transaction.findMany({
    where: {
      ...txWhere,
      purchaseDate: { gte: start, lt: end },
      ...(q
        ? {
            OR: [
              { memo: { contains: q, mode: "insensitive" } },
              { splits: { some: { category: { name: { contains: q, mode: "insensitive" } } } } },
              ...(Number.isFinite(Number(q)) ? [{ totalAmount: Math.abs(Math.trunc(Number(q))) }] : []),
            ],
          }
        : {}),
    },
    orderBy,
    take: 200,
    select: { id: true, type: true, totalAmount: true, purchaseDate: true, memo: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">明細</h1>
        <div className="flex items-center gap-2">
          <a className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90" href="/transactions/new">
            追加
          </a>
        </div>
      </div>

      <form className="rounded-2xl border border-black/10 bg-white p-4" action="/transactions" method="get">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="q">
              検索（店名/メモ/カテゴリ/金額）
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="例: スーパー / 食費 / 1200"
              className="w-full rounded-xl border border-black/15 px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="day">
              日付（任意）
            </label>
            <input
              id="day"
              name="day"
              type="date"
              defaultValue={dayDate ? dayDate.toISOString().slice(0, 10) : ""}
              className="w-full rounded-xl border border-black/15 px-3 py-2"
            />
          </div>
          <div className="flex items-end gap-2">
            <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90">適用</button>
            <a className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]" href="/transactions">
              クリア
            </a>
          </div>
        </div>
      </form>

      <div className="rounded-2xl border border-black/10 bg-white">
        <div className="divide-y divide-black/10">
          {txs.length === 0 ? (
            <div className="p-6 text-sm text-black/60">まだ明細がありません。</div>
          ) : (
            txs.map((t) => (
              <a key={t.id} href={`/transactions/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-black/[0.03]">
                <div className="w-24 text-sm text-black/60">
                  {t.purchaseDate.toISOString().slice(0, 10)}
                </div>
                <div className="flex-1 text-sm">{t.memo ?? "（メモなし）"}</div>
                <div className="text-sm font-medium tabular-nums">
                  {t.type === "expense" ? "-" : "+"}¥{yen(t.totalAmount)}
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

