"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export function DangerZone({
  onDeleteData,
  onDeleteAccount,
  disabledDeleteData,
}: {
  onDeleteData: () => void | Promise<void>;
  onDeleteAccount: (emailConfirm: string) => void | Promise<void>;
  disabledDeleteData?: boolean;
}) {
  const [email, setEmail] = useState("");

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <div className="text-sm font-semibold text-red-900">危険操作</div>
      <div className="mt-1 text-sm text-red-900/70">削除は取り消せません。必ず内容を確認してください。</div>

      <div className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/login" })}
          className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-100"
        >
          ログアウト
        </button>

        <button
          type="button"
          disabled={disabledDeleteData}
          onClick={() => {
            const ok = window.confirm("家計簿データを削除しますか？（復元不可）");
            if (!ok) return;
            void onDeleteData();
          }}
          className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-40"
        >
          家計簿データを削除（帳簿）
        </button>

        <div className="rounded-xl border border-red-200 bg-white p-4">
          <div className="text-sm font-medium text-red-900">アカウント削除</div>
          <div className="mt-1 text-xs text-red-900/70">メールアドレスを入力して確定します。</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="メールアドレスを入力"
            className="mt-3 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              const ok = window.confirm("アカウントを削除しますか？（復元不可）");
              if (!ok) return;
              void onDeleteAccount(email);
            }}
            className="mt-3 w-full rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            アカウントを削除する
          </button>
        </div>
      </div>
    </div>
  );
}

