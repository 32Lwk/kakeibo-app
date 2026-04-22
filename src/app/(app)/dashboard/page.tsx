import { prisma } from "@/lib/db";
import { ensureGeneratedForMonth } from "@/lib/monthGeneration";
import { requireAuthedContext } from "@/lib/authz";
import { DashboardCharts } from "@/components/DashboardCharts";

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

function toMonthParam(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function firstString(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function monthLabelFromParam(monthParam: string) {
  const [y, m] = monthParam.split("-").map((n) => Number(n));
  if (!y || !m) return monthParam;
  return `${y}年${m}月`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAuthedContext();

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { summaryOrder: true },
  });
  if (!user) return null;

  const unwrappedSearchParams = searchParams ? await searchParams : undefined;
  await ensureGeneratedForMonth({
    prisma,
    userId: ctx.userId,
    householdId: ctx.householdId,
    month: typeof unwrappedSearchParams?.month === "string" ? unwrappedSearchParams.month : undefined,
  });
  const { year, monthIndex } = parseMonth(unwrappedSearchParams);
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  const monthParam = toMonthParam(year, monthIndex);

  const viewRaw = firstString(unwrappedSearchParams?.view) ?? "month_expense";
  const view =
    viewRaw === "month_income" || viewRaw === "year_expense" || viewRaw === "year_income" ? viewRaw : "month_expense";
  const kind = view.endsWith("income") ? ("income" as const) : ("expense" as const);
  const isYearView = view.startsWith("year_");

  const yearParamRaw = firstString(unwrappedSearchParams?.year);
  const selectedYear = yearParamRaw && /^\d{4}$/.test(yearParamRaw) ? Number(yearParamRaw) : year;
  const yearStart = new Date(selectedYear, 0, 1);
  const yearEnd = new Date(selectedYear + 1, 0, 1);
  const selectedCategoryId = firstString(unwrappedSearchParams?.categoryId) ?? null;

  const txs = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      purchaseDate: { gte: start, lt: end },
    },
    orderBy: { purchaseDate: "desc" },
    take: 20,
    select: { id: true, type: true, totalAmount: true, purchaseDate: true, memo: true },
  });

  const sums = txs.reduce(
    (acc, t) => {
      if (t.type === "expense") acc.expense += t.totalAmount;
      else acc.income += t.totalAmount;
      return acc;
    },
    { expense: 0, income: 0 },
  );

  const cards =
    user.summaryOrder === "income_first"
      ? ([
          { label: "今月の収入", value: sums.income },
          { label: "今月の支出", value: sums.expense },
          { label: "差額", value: sums.income - sums.expense },
        ] as const)
      : ([
          { label: "今月の支出", value: sums.expense },
          { label: "今月の収入", value: sums.income },
          { label: "差額", value: sums.income - sums.expense },
        ] as const);

  const topExpense = await prisma.transactionSplit.groupBy({
    by: ["categoryId"],
    where: {
      transaction: {
        householdId: ctx.householdId,
        type: "expense",
        purchaseDate: { gte: start, lt: end },
      },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 12,
  });

  const topIncome = await prisma.transactionSplit.groupBy({
    by: ["categoryId"],
    where: {
      transaction: {
        householdId: ctx.householdId,
        type: "income",
        purchaseDate: { gte: start, lt: end },
      },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 12,
  });

  const yearExpense = await prisma.transactionSplit.groupBy({
    by: ["categoryId"],
    where: {
      transaction: {
        householdId: ctx.householdId,
        type: "expense",
        purchaseDate: { gte: yearStart, lt: yearEnd },
      },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 12,
  });

  const yearIncome = await prisma.transactionSplit.groupBy({
    by: ["categoryId"],
    where: {
      transaction: {
        householdId: ctx.householdId,
        type: "income",
        purchaseDate: { gte: yearStart, lt: yearEnd },
      },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 12,
  });

  const categoryIds = Array.from(new Set([...topExpense, ...topIncome, ...yearExpense, ...yearIncome].map((r) => r.categoryId)));
  const categories = await prisma.category.findMany({
    where: { householdId: ctx.householdId, id: { in: categoryIds } },
    select: { id: true, name: true },
  });
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const monthExpensePie = topExpense.map((r) => ({
    categoryId: r.categoryId,
    categoryName: categoryNameById.get(r.categoryId) ?? "（不明）",
    value: r._sum.amount ?? 0,
  }));
  const monthIncomePie = topIncome.map((r) => ({
    categoryId: r.categoryId,
    categoryName: categoryNameById.get(r.categoryId) ?? "（不明）",
    value: r._sum.amount ?? 0,
  }));
  const yearExpensePie = yearExpense.map((r) => ({
    categoryId: r.categoryId,
    categoryName: categoryNameById.get(r.categoryId) ?? "（不明）",
    value: r._sum.amount ?? 0,
  }));
  const yearIncomePie = yearIncome.map((r) => ({
    categoryId: r.categoryId,
    categoryName: categoryNameById.get(r.categoryId) ?? "（不明）",
    value: r._sum.amount ?? 0,
  }));

  // Trend series: last 12 months for selected category/kind (relative to selected month)
  const seriesStart = new Date(year, monthIndex - 11, 1);
  const seriesEnd = new Date(year, monthIndex + 1, 1);
  const selectedCategoryName = selectedCategoryId ? categoryNameById.get(selectedCategoryId) ?? null : null;

  const seriesRows =
    selectedCategoryId
      ? await prisma.transactionSplit.findMany({
          where: {
            categoryId: selectedCategoryId,
            transaction: {
              householdId: ctx.householdId,
              type: kind,
              purchaseDate: { gte: seriesStart, lt: seriesEnd },
            },
          },
          select: { amount: true, transaction: { select: { purchaseDate: true } } },
        })
      : [];

  const byMonth = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(seriesStart.getFullYear(), seriesStart.getMonth() + i, 1);
    byMonth.set(toMonthParam(d.getFullYear(), d.getMonth()), 0);
  }
  for (const r of seriesRows) {
    const d = r.transaction.purchaseDate;
    const k = toMonthParam(d.getFullYear(), d.getMonth());
    byMonth.set(k, (byMonth.get(k) ?? 0) + r.amount);
  }
  const series = Array.from(byMonth.entries()).map(([month, value]) => ({ month, value }));

  const categoryTxsRaw =
    selectedCategoryId
      ? await prisma.transaction.findMany({
          where: {
            householdId: ctx.householdId,
            type: kind,
            purchaseDate: { gte: start, lt: end },
            splits: { some: { categoryId: selectedCategoryId } },
          },
          orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
          take: 120,
          select: { id: true, purchaseDate: true, memo: true, totalAmount: true, type: true },
        })
      : [];
  const categoryTxs = categoryTxsRaw.map((t) => ({
    id: t.id,
    purchaseDate: t.purchaseDate.toISOString(),
    memo: t.memo ?? null,
    totalAmount: t.totalAmount,
    type: t.type,
  }));

  // Slider options
  const months = Array.from({ length: 24 }).map((_, i) => {
    const d = new Date(year, monthIndex - (23 - i), 1);
    return toMonthParam(d.getFullYear(), d.getMonth());
  });
  const years = Array.from({ length: 7 }).map((_, i) => selectedYear - 3 + i);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-black/10 bg-zinc-50 p-4 min-h-[calc(100dvh-220px)] flex flex-col">
        <DashboardCharts
          view={view}
          monthParam={monthParam}
          year={selectedYear}
          months={months}
          years={years}
          monthExpense={monthExpensePie}
          monthIncome={monthIncomePie}
          yearExpense={yearExpensePie}
          yearIncome={yearIncomePie}
          selectedCategoryId={selectedCategoryId}
          selectedCategoryName={selectedCategoryName}
          series={selectedCategoryId ? series : []}
          categoryTxs={categoryTxs}
        />
        {selectedCategoryId ? (
          <div className="mt-2 text-xs text-black/50">
            選択中: <span className="font-medium">{selectedCategoryName ?? selectedCategoryId}</span>（{isYearView ? "年" : "月"} /{" "}
            {kind === "expense" ? "支出" : "収入"}） / 推移: {toMonthParam(seriesStart.getFullYear(), seriesStart.getMonth())}〜{monthParam} / 明細:{" "}
            {monthLabelFromParam(monthParam)}
          </div>
        ) : null}
      </section>
    </div>
  );
}

