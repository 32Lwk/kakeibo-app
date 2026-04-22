import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

export default async function DashboardPage() {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId },
    select: { householdId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const txs = await prisma.transaction.findMany({
    where: {
      householdId: membership.householdId,
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <div className="text-sm text-black/60">今月の支出</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">
            ¥{yen(sums.expense)}
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <div className="text-sm text-black/60">今月の収入</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">
            ¥{yen(sums.income)}
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <div className="text-sm text-black/60">差額</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">
            ¥{yen(sums.income - sums.expense)}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">最近の明細</h2>
          <a className="text-sm underline" href="/transactions/new">
            追加
          </a>
        </div>
        <div className="mt-4 divide-y divide-black/10">
          {txs.length === 0 ? (
            <div className="py-6 text-sm text-black/60">
              まだ明細がありません。まずは追加してみましょう。
            </div>
          ) : (
            txs.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-3">
                <div className="w-24 text-sm text-black/60">
                  {t.purchaseDate.toISOString().slice(0, 10)}
                </div>
                <div className="flex-1 text-sm">{t.memo ?? "（メモなし）"}</div>
                <div className="text-sm font-medium tabular-nums">
                  {t.type === "expense" ? "-" : "+"}¥{yen(t.totalAmount)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

