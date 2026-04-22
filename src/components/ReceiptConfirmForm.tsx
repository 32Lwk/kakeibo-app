"use client";

import { useState } from "react";
import { SplitEditor, type SplitDraft } from "@/components/SplitEditor";

export function ReceiptConfirmForm({
  action,
  categories,
  initial,
  disabled,
}: {
  action: (formData: FormData) => void | Promise<void>;
  categories: { id: string; name: string }[];
  initial: {
    storeName: string;
    purchaseDate: string; // YYYY-MM-DD
    totalAmount: number;
    memo: string;
    splits: SplitDraft[];
  };
  disabled?: boolean;
}) {
  const [totalAmount, setTotalAmount] = useState<number>(initial.totalAmount);

  return (
    <form className="max-w-2xl space-y-4 rounded-2xl border border-black/10 bg-white p-6" action={action}>
      <div className="text-sm font-medium">登録</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="storeName">
            店名（任意）
          </label>
          <input
            id="storeName"
            name="storeName"
            defaultValue={initial.storeName}
            className="w-full rounded-xl border border-black/15 px-3 py-2"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="purchaseDate">
            日付
          </label>
          <input
            id="purchaseDate"
            name="purchaseDate"
            type="date"
            defaultValue={initial.purchaseDate}
            className="w-full rounded-xl border border-black/15 px-3 py-2"
            required
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="totalAmount">
          合計（円）
        </label>
        <input
          id="totalAmount"
          name="totalAmount"
          type="number"
          inputMode="numeric"
          className="w-full rounded-xl border border-black/15 px-3 py-2"
          required
          min={0}
          value={Number.isFinite(totalAmount) ? totalAmount : 0}
          onChange={(e) => {
            const n = Math.trunc(Number(e.currentTarget.value));
            setTotalAmount(Number.isFinite(n) ? Math.max(0, n) : 0);
          }}
          disabled={disabled}
        />
      </div>

      <SplitEditor categories={categories} totalAmount={totalAmount} name="splitsJson" initialSplits={initial.splits} disabled={disabled} />

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="memo">
          メモ（任意）
        </label>
        <input id="memo" name="memo" defaultValue={initial.memo} className="w-full rounded-xl border border-black/15 px-3 py-2" disabled={disabled} />
      </div>

      <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-40" disabled={disabled}>
        明細として登録
      </button>
    </form>
  );
}

