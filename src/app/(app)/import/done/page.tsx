import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ImportDonePage({
  searchParams,
}: {
  searchParams: { count?: string; unknown?: string };
}) {
  const session = await getSession();
  if (!session?.user) return null;

  const { count, unknown } = searchParams;
  const createdCount = Number(count ?? "0");
  const unknownList = (unknown ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">取込完了</h1>
      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <div className="text-sm text-black/60">作成された明細</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">{createdCount}</div>

        {unknownList.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="text-sm font-medium">未知カテゴリ（未分類へ寄せました）</div>
            <div className="text-sm text-black/70">
              {unknownList.slice(0, 30).join(" / ")}
              {unknownList.length > 30 ? " …" : ""}
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <a className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90" href="/transactions">
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

