import { Prisma, PrismaClient, TransactionType } from "@prisma/client";

function parseMonthParam(month: string | null | undefined): { year: number; monthIndex: number; month: string } {
  const now = new Date();
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return { year: now.getFullYear(), monthIndex: now.getMonth(), month: m };
  }
  const [y, m] = month.split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    const mm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return { year: now.getFullYear(), monthIndex: now.getMonth(), month: mm };
  }
  return { year: y, monthIndex: m - 1, month };
}

function monthStartEnd(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  return { start, end };
}

function prevMonthString(year: number, monthIndex: number) {
  const d = new Date(year, monthIndex - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function ensureCarryoverCategoryExists(prisma: PrismaClient, householdId: string) {
  const existing = await prisma.category.findFirst({
    where: { householdId, name: "繰越" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { householdId, name: "繰越", sortOrder: 9999, isDefault: false },
    select: { id: true },
  });
  return created.id;
}

export async function ensureGeneratedForMonth({
  prisma,
  userId,
  householdId,
  month,
}: {
  prisma: PrismaClient;
  userId: string;
  householdId: string;
  month: string | null | undefined;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { recurringAutoApply: true, carryoverEnabled: true },
  });
  if (!user) return;

  const m = parseMonthParam(month);
  const { start, end } = monthStartEnd(m.year, m.monthIndex);

  if (user.recurringAutoApply) {
    await ensureRecurringForMonth({ prisma, householdId, month: m.month, year: m.year, monthIndex: m.monthIndex });
  }
  if (user.carryoverEnabled) {
    await ensureCarryoverForMonth({
      prisma,
      householdId,
      month: m.month,
      year: m.year,
      monthIndex: m.monthIndex,
      start,
      end,
    });
  }
}

async function ensureRecurringForMonth({
  prisma,
  householdId,
  month,
  year,
  monthIndex,
}: {
  prisma: PrismaClient;
  householdId: string;
  month: string; // YYYY-MM
  year: number;
  monthIndex: number;
}) {
  const rules = await prisma.recurringRule.findMany({
    where: { householdId, isActive: true, startMonth: { lte: month } },
    select: { id: true, type: true, dayOfMonth: true, amount: true, memo: true, categoryId: true, accountType: true },
    orderBy: [{ dayOfMonth: "asc" }, { createdAt: "asc" }],
  });
  if (rules.length === 0) return;

  const uncategorizedId =
    (
      await prisma.category.findFirst({
        where: { householdId, name: "未分類" },
        select: { id: true },
      })
    )?.id ?? null;

  for (const r of rules) {
    const purchaseDate = new Date(year, monthIndex, r.dayOfMonth);
    const categoryId = r.categoryId ?? uncategorizedId;
    if (!categoryId) continue;

    try {
      await prisma.transaction.create({
        data: {
          householdId,
          type: r.type,
          purchaseDate,
          totalAmount: r.amount,
          memo: r.memo ?? (r.type === "income" ? "定期収入" : "固定費"),
          accountType: r.accountType ?? undefined,
          generatedKind: "recurring",
          generatedMonth: month,
          generatedKey: r.id,
          recurringRuleId: r.id,
          splits: { create: [{ categoryId, amount: r.amount }] },
        },
      });
    } catch (e) {
      // ignore duplicates
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
}

async function ensureCarryoverForMonth({
  prisma,
  householdId,
  month,
  year,
  monthIndex,
  start,
  end,
}: {
  prisma: PrismaClient;
  householdId: string;
  month: string;
  year: number;
  monthIndex: number;
  start: Date;
  end: Date;
}) {
  const _prevMonth = prevMonthString(year, monthIndex);
  const { start: prevStart, end: prevEnd } = monthStartEnd(
    new Date(year, monthIndex - 1, 1).getFullYear(),
    new Date(year, monthIndex - 1, 1).getMonth(),
  );

  // Carry over only net income/expense of the previous month (single transaction)
  const prevTxs = await prisma.transaction.findMany({
    where: { householdId, purchaseDate: { gte: prevStart, lt: prevEnd } },
    select: { type: true, totalAmount: true },
  });

  const net = prevTxs.reduce((acc, t) => acc + (t.type === "income" ? t.totalAmount : -t.totalAmount), 0);
  if (!net) return;

  const carryoverCategoryId = await ensureCarryoverCategoryExists(prisma, householdId);
  const monthFirst = new Date(year, monthIndex, 1);

  try {
    await prisma.transaction.create({
      data: {
        householdId,
        type: net >= 0 ? TransactionType.income : TransactionType.expense,
        purchaseDate: monthFirst,
        totalAmount: Math.abs(net),
        memo: "前月繰越（収支）",
        accountType: "carryover",
        generatedKind: "carryover_account",
        generatedMonth: month,
        generatedKey: "net",
        splits: { create: [{ categoryId: carryoverCategoryId, amount: Math.abs(net) }] },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
}

