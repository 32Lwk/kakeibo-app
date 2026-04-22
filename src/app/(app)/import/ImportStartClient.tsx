"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePicker } from "@/components/FilePicker";

export function ImportStartClient({ showOwnerOptions }: { showOwnerOptions: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError("");
      setSubmitting(true);
      try {
        const fd = new FormData(e.currentTarget);
        const res = await fetch("/api/import/start", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(String(json.error ?? "取込開始に失敗しました。"));
        const importId = String(json.importId ?? "");
        if (!importId) throw new Error("importId が取得できませんでした。");
        router.push(`/import/progress?id=${encodeURIComponent(importId)}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [router],
  );

  return (
    <form className="max-w-xl space-y-4 rounded-2xl border border-black/10 bg-white p-6" onSubmit={onSubmit}>
      <div className="space-y-1">
        <div className="text-sm font-medium">CSVファイル</div>
        <FilePicker name="file" accept=".csv,text/csv" required />
        <div className="text-xs text-black/50">
          未知カテゴリは一旦「未分類」に寄せます（後で一括マッピングできます）。
          カテゴリ新規作成は owner のみ許可です。
        </div>
      </div>

      {showOwnerOptions ? (
        <label className="flex items-start gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-sm">
          <input type="checkbox" name="createUnknownCategories" className="mt-1 size-4 rounded border-black/20" />
          <div>
            <div className="font-medium">未知カテゴリを自動作成する（ownerのみ）</div>
            <div className="text-xs text-black/50">取り込み時に未知カテゴリを登録しておき、後で割り当て直しやすくします。</div>
          </div>
        </label>
      ) : null}

      <button
        className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-60"
        disabled={submitting}
      >
        {submitting ? "開始中…" : "取り込む"}
      </button>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
    </form>
  );
}

