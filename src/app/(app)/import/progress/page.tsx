"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ImportSummary =
  | null
  | {
      status?: "queued" | "running" | "done" | "error";
      phase?: string;
      processed?: number;
      total?: number;
      totalRows?: number;
      totalValidRows?: number;
      totalNewRows?: number;
      createdCount?: number;
      skippedDuplicates?: number;
      skippedInvalid?: number;
      unknownCategories?: string[];
      month?: string;
      fileName?: string;
      error?: string;
    };

export default function ImportProgressPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const id = sp.get("id") ?? "";
  const [summary, setSummary] = useState<ImportSummary>(null);
  const [fileName, setFileName] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [pendingBack, setPendingBack] = useState(false);
  const allowNavRef = useRef(false);

  const pct = useMemo(() => {
    const total = summary?.total ?? 0;
    const processed = summary?.processed ?? 0;
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.floor((processed / total) * 100)));
  }, [summary]);

  const shouldWarnLeave = summary?.status === "queued" || summary?.status === "running" || summary?.status == null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const tick = async () => {
      const res = await fetch(`/api/import/status?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (cancelled) return;
      setSummary(json.summary ?? null);
      setFileName(String(json.fileName ?? ""));
    };
    void tick();
    const t = setInterval(tick, 700);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (summary?.status === "done") {
      router.replace(`/import/done?importId=${encodeURIComponent(id)}`);
    }
  }, [id, summary?.status, router]);

  // Prevent accidental navigation while running (not shown when done).
  useEffect(() => {
    if (!shouldWarnLeave) return;

    // Make back button confirmable: insert a sentinel state.
    try {
      history.pushState({ __importProgressSentinel: true }, "", window.location.href);
    } catch {
      // ignore
    }

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowNavRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };

    const onDocumentClickCapture = (e: MouseEvent) => {
      if (allowNavRef.current) return;
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href) return;
      if (href.startsWith("#")) return;
      // allow same-path hash or noop
      if (href === window.location.pathname + window.location.search) return;
      e.preventDefault();
      setPendingHref(a.href);
      setPendingBack(false);
      setConfirmOpen(true);
    };

    const onPopState = () => {
      if (allowNavRef.current) return;
      // Immediately stay on page, then ask.
      try {
        history.pushState({ __importProgressSentinel: true }, "", window.location.href);
      } catch {
        // ignore
      }
      setPendingHref(null);
      setPendingBack(true);
      setConfirmOpen(true);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocumentClickCapture, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocumentClickCapture, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [shouldWarnLeave]);

  const confirmLeave = () => {
    allowNavRef.current = true;
    setConfirmOpen(false);
    if (pendingBack) {
      // go back (the sentinel entry will be consumed)
      setTimeout(() => history.back(), 0);
      return;
    }
    if (pendingHref) {
      window.location.href = pendingHref;
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">取込中</h1>
        <div className="text-sm text-black/60">{fileName ? `ファイル: ${fileName}` : "ファイル: （読み込み中）"}</div>
      </div>

      <div className="max-w-xl space-y-4 rounded-2xl border border-black/10 bg-white p-6">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <div className="font-medium">
              {summary?.status === "error"
                ? "エラー"
                : summary?.status === "done"
                  ? "完了"
                  : summary?.phase
                    ? `処理中（${summary.phase}）`
                    : "処理中"}
            </div>
            <div className="text-black/60 tabular-nums">{summary?.total ? `${pct}%` : "—"}</div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className={[
                "h-full bg-black transition-[width]",
                summary?.total ? "" : "animate-pulse opacity-60",
              ].join(" ")}
              style={{ width: `${summary?.total ? pct : 25}%` }}
            />
          </div>
          <div className="text-xs text-black/50">
            {summary?.total ? (
              <span className="tabular-nums">
                {summary?.processed ?? 0} / {summary.total}
              </span>
            ) : (
              "準備中…"
            )}
          </div>
        </div>

        {summary?.totalRows ? (
          <div className="grid gap-1 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-xs text-black/70">
            <div className="flex justify-between gap-3">
              <div>CSV行数</div>
              <div className="tabular-nums">{summary.totalRows}</div>
            </div>
            {typeof summary.totalValidRows === "number" ? (
              <div className="flex justify-between gap-3">
                <div>有効行（解析OK）</div>
                <div className="tabular-nums">{summary.totalValidRows}</div>
              </div>
            ) : null}
            {typeof summary.totalNewRows === "number" ? (
              <div className="flex justify-between gap-3">
                <div>新規作成対象（重複除外後）</div>
                <div className="tabular-nums">{summary.totalNewRows}</div>
              </div>
            ) : null}
            {typeof summary.skippedDuplicates === "number" ? (
              <div className="flex justify-between gap-3">
                <div>既存重複スキップ</div>
                <div className="tabular-nums">{summary.skippedDuplicates}</div>
              </div>
            ) : null}
            {typeof summary.skippedInvalid === "number" ? (
              <div className="flex justify-between gap-3">
                <div>無効行スキップ</div>
                <div className="tabular-nums">{summary.skippedInvalid}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {summary?.status === "error" ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{summary.error ?? "不明なエラー"}</div>
        ) : null}

        <div className="text-xs text-black/50">
          取り込み中はこのページを閉じずにお待ちください。完了すると自動で結果画面へ移動します。
        </div>
      </div>

      {confirmOpen && shouldWarnLeave ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5"
        >
          <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold">ページを移動しますか？</div>
            <div className="mt-2 text-sm text-black/70">
              取込処理は継続しますが、完了するまではこの画面で進捗を確認できます。移動すると進捗表示が見えなくなります。
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
                onClick={() => setConfirmOpen(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
                onClick={confirmLeave}
              >
                移動する
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

