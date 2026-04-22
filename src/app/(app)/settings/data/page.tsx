import { prisma } from "@/lib/db";
import { requireAuthedContext } from "@/lib/authz";

export const dynamic = "force-dynamic";

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

export default async function DataSettingsPage() {
  const ctx = await requireAuthedContext();

  const [txCount, firstTx, lastTx, sums, importCount, latestImport] = await Promise.all([
    prisma.transaction.count({ where: { householdId: ctx.householdId } }),
    prisma.transaction.findFirst({
      where: { householdId: ctx.householdId },
      orderBy: { purchaseDate: "asc" },
      select: { purchaseDate: true },
    }),
    prisma.transaction.findFirst({
      where: { householdId: ctx.householdId },
      orderBy: { purchaseDate: "desc" },
      select: { purchaseDate: true },
    }),
    prisma.transaction.groupBy({
      by: ["type"],
      where: { householdId: ctx.householdId },
      _sum: { totalAmount: true },
    }),
    prisma.import.count({ where: { householdId: ctx.householdId } }),
    prisma.import.findFirst({
      where: { householdId: ctx.householdId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, source: true, fileName: true, summary: true },
    }),
  ]);

  const expenseSum = sums.find((s) => s.type === "expense")?._sum.totalAmount ?? 0;
  const incomeSum = sums.find((s) => s.type === "income")?._sum.totalAmount ?? 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">データ設定</h1>
        <div className="text-sm text-black/60">CSVの取込/エクスポート、現在のデータ状況を確認できます。</div>
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="text-sm font-medium">CSV取込</div>
          <div className="mt-1 text-sm text-black/60">`amounts.csv` 互換のCSVを取り込みます。</div>
          <div className="mt-4">
            <a className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90" href="/import">
              開く
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="text-sm font-medium">CSVエクスポート</div>
          <div className="mt-1 text-sm text-black/60">全明細を `amounts.csv` 互換でダウンロードします。</div>
          <div className="mt-4">
            <a
              className="inline-flex rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
              href="/export"
            >
              ダウンロード
            </a>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="text-sm font-medium">データベース状況（この家計）</div>
          <div className="mt-4 grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-black/60">明細件数</div>
              <div className="tabular-nums">{txCount}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-black/60">最古の日付</div>
              <div className="tabular-nums">{firstTx?.purchaseDate ? firstTx.purchaseDate.toISOString().slice(0, 10) : "—"}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-black/60">最新の日付</div>
              <div className="tabular-nums">{lastTx?.purchaseDate ? lastTx.purchaseDate.toISOString().slice(0, 10) : "—"}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-black/60">支出合計</div>
              <div className="tabular-nums">-¥{yen(expenseSum)}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-black/60">収入合計</div>
              <div className="tabular-nums">+¥{yen(incomeSum)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="text-sm font-medium">取込履歴</div>
          <div className="mt-1 text-sm text-black/60">これまでの取込回数と最新の取込結果です。</div>
          <div className="mt-4 grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-black/60">取込回数</div>
              <div className="tabular-nums">{importCount}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-black/60">最新</div>
              <div className="tabular-nums">{latestImport?.createdAt ? latestImport.createdAt.toISOString().slice(0, 19).replace("T", " ") : "—"}</div>
            </div>
            {latestImport ? (
              <div className="text-xs text-black/50">
                source: {latestImport.source}
                {latestImport.fileName ? ` / file: ${latestImport.fileName}` : ""}
              </div>
            ) : null}
            {latestImport?.id ? (
              <div className="mt-2">
                <a
                  className="inline-flex rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
                  href={`/import/done?importId=${latestImport.id}`}
                >
                  最新の取込結果を見る
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <div className="text-sm font-medium">重複チェック</div>
        <div className="mt-1 text-sm text-black/60">
          検索・絞り込み（メモ/日時/金額）や、選択削除（モーダル確認）に対応しています。
        </div>
        <div className="mt-4">
          <a
            className="inline-flex rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
            href="/settings/data/duplicates"
          >
            重複チェックを開く
          </a>
        </div>
      </div>
    </div>
  );
}

