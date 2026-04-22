"use client";

import { useEffect, useMemo, useState } from "react";

export type SplitDraft = {
  categoryId: string;
  amount: number;
};

function sumAmounts(splits: SplitDraft[]) {
  return splits.reduce((a, s) => a + (Number.isFinite(s.amount) ? s.amount : 0), 0);
}

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

export function SplitEditor({
  categories,
  totalAmount,
  name,
  initialSplits,
  disabled,
  maxSplits = 12,
}: {
  categories: { id: string; name: string }[];
  totalAmount: number;
  name: string; // hidden input name
  initialSplits: SplitDraft[];
  disabled?: boolean;
  maxSplits?: number;
}) {
  const fallbackCategoryId = categories[0]?.id ?? "";
  const [splits, setSplits] = useState<SplitDraft[]>(
    initialSplits.length ? initialSplits : [{ categoryId: fallbackCategoryId, amount: Math.max(0, totalAmount) }],
  );

  // Keep at least 1 split
  useEffect(() => {
    if (splits.length === 0) {
      setSplits([{ categoryId: fallbackCategoryId, amount: Math.max(0, totalAmount) }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splits.length, fallbackCategoryId, totalAmount]);

  // If total changes and it's a single split, follow it.
  useEffect(() => {
    if (splits.length === 1) {
      setSplits([{ ...splits[0]!, amount: Math.max(0, totalAmount) }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAmount]);

  const totalSplit = useMemo(() => sumAmounts(splits), [splits]);
  const remaining = totalAmount - totalSplit;
  const ok = remaining === 0 && splits.every((s) => s.categoryId && Number.isInteger(s.amount) && s.amount >= 0);

  const serialized = useMemo(() => JSON.stringify(splits), [splits]);

  return (
    <div className="space-y-3 rounded-xl border border-black/10 bg-black/[0.02] p-4">
      <input type="hidden" name={name} value={serialized} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">カテゴリ内訳</div>
          <div className="text-xs text-black/50">合計一致で確定できます（残額が0になるように調整）。</div>
        </div>
        <div className="text-right text-xs text-black/60 tabular-nums">
          <div>
            内訳合計: ¥{yen(totalSplit)} / 合計: ¥{yen(totalAmount)}
          </div>
          <div className={remaining === 0 ? "text-emerald-700" : "text-rose-700"}>
            残額: {remaining === 0 ? "¥0" : `¥${yen(Math.abs(remaining))}${remaining < 0 ? "（超過）" : ""}`}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {splits.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
            <select
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm"
              value={s.categoryId}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setSplits((prev) => prev.map((p, idx) => (idx === i ? { ...p, categoryId: v } : p)));
              }}
              disabled={disabled}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm tabular-nums"
              inputMode="numeric"
              type="number"
              min={0}
              value={Number.isFinite(s.amount) ? s.amount : 0}
              onChange={(e) => {
                const n = Math.trunc(Number(e.currentTarget.value));
                setSplits((prev) => prev.map((p, idx) => (idx === i ? { ...p, amount: Number.isFinite(n) ? n : 0 } : p)));
              }}
              disabled={disabled}
            />
            <button
              type="button"
              className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-40"
              disabled={disabled || splits.length <= 1}
              onClick={() => setSplits((prev) => prev.filter((_, idx) => idx !== i))}
            >
              削除
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-40"
          disabled={disabled || splits.length >= maxSplits}
          onClick={() => setSplits((prev) => [...prev, { categoryId: fallbackCategoryId, amount: Math.max(0, remaining) }])}
        >
          内訳を追加
        </button>
        {!ok ? <div className="text-xs font-medium text-rose-700">残額が0になるように調整してください。</div> : null}
      </div>
    </div>
  );
}

