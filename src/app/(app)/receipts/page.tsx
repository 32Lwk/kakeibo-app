import { prisma } from "@/lib/db";
import { requireAuthedContext, scopedTx } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const ctx = await requireAuthedContext({ onUnauthorized: "redirect" });
  const rxWhere = scopedTx(ctx);

  const receipts = await prisma.receipt.findMany({
    where: { ...rxWhere },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      storeName: true,
      purchaseDate: true,
      totalAmount: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">レシート</h1>
          <div className="text-sm text-black/60">アップロードして解析し、明細として登録します。</div>
        </div>
        <a className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90" href="/receipts/new">
          追加
        </a>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white">
        <div className="divide-y divide-black/10">
          {receipts.length === 0 ? (
            <div className="p-6 text-sm text-black/60">まだレシートがありません。</div>
          ) : (
            receipts.map((r) => (
              <a key={r.id} href={`/receipts/${r.id}`} className="block px-6 py-4 hover:bg-black/[0.03]">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium text-black/80">{r.storeName ?? "（店名未設定）"}</div>
                  <div className="text-xs text-black/50">{r.status}</div>
                </div>
                <div className="mt-1 text-sm text-black/60 tabular-nums">
                  {r.purchaseDate ? r.purchaseDate.toISOString().slice(0, 10) : "日付未設定"} / ¥
                  {new Intl.NumberFormat("ja-JP").format(r.totalAmount ?? 0)}
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

