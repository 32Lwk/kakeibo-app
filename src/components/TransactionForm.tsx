"use client";

import { useMemo, useState } from "react";
import { SplitEditor, type SplitDraft } from "@/components/SplitEditor";

export function TransactionForm({
  title,
  submitLabel,
  action,
  categories,
  initial,
  disabled,
  showBackHref,
  hiddenFields,
  headerRight,
  splitDefaultOpen,
}: {
  title: string;
  submitLabel: string;
  action: (formData: FormData) => void | Promise<void>;
  categories: { id: string; name: string }[];
  initial: {
    type: "expense" | "income";
    purchaseDate: string; // YYYY-MM-DD
    totalAmount: number;
    memo: string;
    splits: SplitDraft[];
  };
  disabled?: boolean;
  showBackHref?: string;
  hiddenFields?: Record<string, string | undefined | null>;
  headerRight?: React.ReactNode;
  splitDefaultOpen?: boolean;
}) {
  const [totalAmount, setTotalAmount] = useState<number>(initial.totalAmount);

  const initialSplits = useMemo(() => initial.splits, [initial.splits]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {showBackHref ? (
            <a className="text-sm text-black/60 underline" href={showBackHref}>
              戻る
            </a>
          ) : null}
        </div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </div>

      <form className="max-w-xl space-y-4 rounded-2xl border border-black/10 bg-white p-6 shadow-sm" action={action}>
        {hiddenFields
          ? Object.entries(hiddenFields).map(([k, v]) =>
              v == null || v === "" ? null : <input key={k} type="hidden" name={k} value={v} />,
            )
          : null}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="type">
              種別
            </label>
            <select
              id="type"
              name="type"
              className="w-full rounded-xl border border-black/15 px-3 py-2"
              defaultValue={initial.type}
              disabled={disabled}
            >
              <option value="expense">支出</option>
              <option value="income">収入</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="purchaseDate">
              日付
            </label>
            <input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              required
              className="w-full rounded-xl border border-black/15 px-3 py-2"
              defaultValue={initial.purchaseDate}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="totalAmount">
            金額（円）
          </label>
          <input
            id="totalAmount"
            name="totalAmount"
            type="number"
            inputMode="numeric"
            required
            min={0}
            className="w-full rounded-xl border border-black/15 px-3 py-2"
            value={Number.isFinite(totalAmount) ? totalAmount : 0}
            onChange={(e) => {
              const n = Math.trunc(Number(e.currentTarget.value));
              setTotalAmount(Number.isFinite(n) ? Math.max(0, n) : 0);
            }}
            disabled={disabled}
          />
        </div>

        <details
          className="rounded-xl border border-black/10 bg-black/[0.02] p-4"
          open={splitDefaultOpen ?? initialSplits.length > 1}
        >
          <summary className="cursor-pointer text-sm font-medium text-black/80">カテゴリ内訳（分割）</summary>
          <div className="mt-3">
            <SplitEditor categories={categories} totalAmount={totalAmount} name="splitsJson" initialSplits={initialSplits} disabled={disabled} />
          </div>
        </details>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="memo">
            メモ（店名もここに）
          </label>
          <input
            id="memo"
            name="memo"
            className="w-full rounded-xl border border-black/15 px-3 py-2"
            placeholder="例: スーパー / 電車 / ランチ など"
            defaultValue={initial.memo}
            disabled={disabled}
          />
        </div>

        <div className="pt-2">
          <button className="w-full rounded-xl bg-black px-3 py-2 text-white hover:bg-black/90 disabled:opacity-40" disabled={disabled}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

