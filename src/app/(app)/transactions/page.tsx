import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

export default async function TransactionsPage() {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId },
    select: { householdId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;

  const txs = await prisma.transaction.findMany({
    where: { householdId: membership.householdId },
    orderBy: { purchaseDate: "desc" },
    take: 200,
    select: { id: true, type: true, totalAmount: true, purchaseDate: true, memo: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">明細</h1>
        <a className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90" href="/transactions/new">
          追加
        </a>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white">
        <div className="divide-y divide-black/10">
          {txs.length === 0 ? (
            <div className="p-6 text-sm text-black/60">まだ明細がありません。</div>
          ) : (
            txs.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3">
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
      </div>
    </div>
  );
}

