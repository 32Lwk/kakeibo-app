import { prisma } from "@/lib/db";
import { requireAuthedContext, scopedTx } from "@/lib/authz";
import { CalendarHeader } from "@/components/CalendarHeader";

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

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function clampDayString(day: string | string[] | undefined) {
  const v = Array.isArray(day) ? day[0] : day;
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toMonthParam(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAuthedContext({ onUnauthorized: "redirect" });
  const txWhere = scopedTx(ctx);
  const unwrapped = searchParams ? await searchParams : undefined;
  const { year, monthIndex } = parseMonth(unwrapped);
  const q = (typeof unwrapped?.q === "string" ? unwrapped.q : Array.isArray(unwrapped?.q) ? unwrapped?.q[0] : "").trim();

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { weekStartsOn: true },
  });
  if (!user) return null;

  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  const monthParam = toMonthParam(year, monthIndex);

  const txs = await prisma.transaction.findMany({
    where: { ...txWhere, purchaseDate: { gte: start, lt: end } },
    select: { purchaseDate: true, type: true, totalAmount: true },
  });

  const byDay = new Map<string, { expense: number; income: number }>();
  const monthSums = txs.reduce(
    (acc, t) => {
      if (t.type === "expense") acc.expense += t.totalAmount;
      else acc.income += t.totalAmount;
      return acc;
    },
    { expense: 0, income: 0 },
  );
  for (const t of txs) {
    const k = ymd(t.purchaseDate);
    const cur = byDay.get(k) ?? { expense: 0, income: 0 };
    if (t.type === "expense") cur.expense += t.totalAmount;
    else cur.income += t.totalAmount;
    byDay.set(k, cur);
  }

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDow = start.getDay(); // 0=Sun
  const offset = (firstDow - user.weekStartsOn + 7) % 7;
  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;

  const weekdayLabels = Array.from({ length: 7 }).map((_, i) => {
    const dow = (user.weekStartsOn + i) % 7;
    return ["日", "月", "火", "水", "木", "金", "土"][dow]!;
  });

  const selectedDay = clampDayString(unwrapped?.day);
  const selectedDayKey = selectedDay ? ymd(selectedDay) : null;

  const monthTxs = await prisma.transaction.findMany({
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
    orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, type: true, totalAmount: true, purchaseDate: true, memo: true },
  });

  return (
    <div className="space-y-6 min-h-[calc(100dvh-220px)] flex flex-col">
      <CalendarHeader />

      <div className="rounded-2xl border border-black/10 bg-white p-4 flex flex-col flex-1">
        <div className="grid grid-cols-7 gap-2">
          {weekdayLabels.map((w) => (
            <div key={w} className="px-1 py-2 text-center text-xs font-medium text-black/60">
              {w}
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-2">
          {Array.from({ length: totalCells }).map((_, idx) => {
            const dayNum = idx - offset + 1;
            if (dayNum < 1 || dayNum > daysInMonth) {
              return <div key={idx} className="h-20 rounded-xl bg-black/[0.02]" />;
            }
            const date = new Date(year, monthIndex, dayNum);
            const key = ymd(date);
            const sums = byDay.get(key) ?? { expense: 0, income: 0 };
            const has = sums.expense !== 0 || sums.income !== 0;
            const active = selectedDayKey === key;
            return (
              <a
                key={idx}
                href={`/calendar?month=${encodeURIComponent(monthParam)}&day=${encodeURIComponent(key)}`}
                className={[
                  "h-20 rounded-xl border px-2 py-2 hover:bg-black/[0.03]",
                  active ? "border-black bg-black/[0.03]" : "border-black/10",
                  has ? "bg-white" : "bg-black/[0.01]",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-medium tabular-nums">{dayNum}</div>
                </div>
                <div className="mt-2 space-y-0.5 text-[11px] tabular-nums">
                  {sums.expense ? <div className="text-rose-700">-¥{yen(sums.expense)}</div> : <div className="text-black/20"> </div>}
                  {sums.income ? <div className="text-emerald-700">+¥{yen(sums.income)}</div> : <div className="text-black/20"> </div>}
                </div>
              </a>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm">
          <div className="space-y-0.5">
            <div className="text-xs text-black/50">収入</div>
            <div className="font-semibold tabular-nums text-emerald-700">+¥{yen(monthSums.income)}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xs text-black/50">支出</div>
            <div className="font-semibold tabular-nums text-rose-700">-¥{yen(monthSums.expense)}</div>
          </div>
          <div className="space-y-0.5 text-right">
            <div className="text-xs text-black/50">合計</div>
            <div className="font-semibold tabular-nums">¥{yen(monthSums.income - monthSums.expense)}</div>
          </div>
        </div>

        <div className="mt-4 border-t border-black/10 pt-4 flex-1">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-medium">明細</div>
              <div className="text-xs text-black/50">
                {q ? `検索: ${q}` : selectedDayKey ? `選択中: ${selectedDayKey}` : "当月の明細（日時の昇順）"}
              </div>
            </div>
            <a className="text-sm underline" href={`/transactions?month=${encodeURIComponent(monthParam)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
              明細一覧で開く
            </a>
          </div>

          {monthTxs.length === 0 ? (
            <div className="mt-3 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-sm text-black/60">
              {q ? "条件に一致する明細がありません。" : "この月の明細がありません。"}
            </div>
          ) : (
            <div className="mt-3 divide-y divide-black/10 rounded-xl border border-black/10 bg-white">
              {monthTxs.map((t) => (
                <a key={t.id} href={`/transactions/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-black/[0.03]">
                  <div className="w-28 text-xs text-black/50 tabular-nums">{t.purchaseDate.toISOString().slice(0, 16).replace("T", " ")}</div>
                  <div className="flex-1 text-sm">{t.memo ?? "（メモなし）"}</div>
                  <div className="text-sm font-medium tabular-nums">
                    {t.type === "expense" ? "-" : "+"}¥{yen(t.totalAmount)}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

