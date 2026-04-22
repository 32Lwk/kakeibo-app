import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ImportDonePage({
  searchParams,
}: {
  searchParams: Promise<{ count?: string; unknown?: string; skipped?: string; month?: string; file?: string; importId?: string }>;
}) {
  const session = await getSession();
  if (!session?.user) return null;

  const { count, unknown, skipped, month, file, importId } = await searchParams;

  let createdCount = Number(count ?? "0");
  let skippedDuplicates = Number(skipped ?? "0");
  let unknownList = (unknown ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let monthParam = month && /^\d{4}-\d{2}$/.test(month) ? month : null;
  let fileLabel = (file ?? "").trim();
  let invalidSamples: Array<{ line: number; amount?: string; date?: string; memo?: string; category?: string; reason?: string }> = [];

  if (importId) {
    const row = await prisma.import.findFirst({
      where: { id: importId },
      select: { summary: true, fileName: true },
    });
    const summary = (row?.summary ?? null) as any;
    if (summary && typeof summary === "object") {
      if (typeof summary.createdCount === "number") createdCount = summary.createdCount;
      if (typeof summary.skippedDuplicates === "number") skippedDuplicates = summary.skippedDuplicates;
      if (Array.isArray(summary.unknownCategories)) unknownList = summary.unknownCategories.map(String);
      if (typeof summary.month === "string" && /^\d{4}-\d{2}$/.test(summary.month)) monthParam = summary.month;
      if (typeof summary.fileName === "string") fileLabel = summary.fileName;
      if (Array.isArray(summary.invalidSamples)) invalidSamples = summary.invalidSamples;
    }
    if (!fileLabel && row?.fileName) fileLabel = row.fileName;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">取込完了</h1>
      <div className="rounded-2xl border border-black/10 bg-white p-6">
        {fileLabel ? <div className="text-sm text-black/50">ファイル: {fileLabel}</div> : null}
        <div className="text-sm text-black/60">作成された明細</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">{createdCount}</div>

        {skippedDuplicates > 0 && (
          <div className="mt-4 text-sm text-black/70">
            重複の可能性があるためスキップ: <span className="font-medium tabular-nums">{skippedDuplicates}</span>
          </div>
        )}

        {unknownList.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="text-sm font-medium">未知カテゴリ（未分類へ寄せました）</div>
            <div className="text-sm text-black/70">
              {unknownList.slice(0, 30).join(" / ")}
              {unknownList.length > 30 ? " …" : ""}
            </div>
          </div>
        )}

        {invalidSamples.length > 0 ? (
          <div className="mt-6 space-y-2">
            <div className="text-sm font-medium">取り込み対象外（形式不正/0など）</div>
            <div className="text-xs text-black/50">先頭 {Math.min(20, invalidSamples.length)} 件を表示します。</div>
            <div className="mt-2 divide-y divide-black/10 overflow-hidden rounded-xl border border-black/10">
              {invalidSamples.slice(0, 20).map((r) => (
                <div key={String(r.line)} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-black/50 tabular-nums">L{r.line}</span>
                    <span className="text-black/80">金額: {r.amount ?? ""}</span>
                    <span className="text-black/80">日付: {r.date ?? ""}</span>
                    <span className="text-black/50">理由: {r.reason ?? "invalid"}</span>
                  </div>
                  {(r.memo || r.category) && (
                    <div className="mt-1 text-xs text-black/50">
                      {r.memo ? `メモ: ${r.memo}` : ""}
                      {r.memo && r.category ? " / " : ""}
                      {r.category ? `カテゴリ: ${r.category}` : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex gap-3">
          <a
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
            href={monthParam ? `/transactions?month=${monthParam}` : "/transactions"}
          >
            明細を見る
          </a>
          <a className="rounded-xl border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/[0.03]" href="/dashboard">
            ダッシュボードへ
          </a>
        </div>
      </div>
    </div>
  );
}

