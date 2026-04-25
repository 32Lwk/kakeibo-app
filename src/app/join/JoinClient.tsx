"use client";

import { useState, useTransition } from "react";
import { acceptHouseholdInvite } from "./actions";

export function JoinClient({
  token,
  householdName,
}: {
  token: string;
  householdName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const callbackUrl = `/join?invite=${encodeURIComponent(token)}`;
  const loginUrl = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const signupUrl = `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const needsAuth = error?.includes("ログインが必要") ?? false;

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 text-neutral-900 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight text-neutral-950">家計簿への招待</h1>
      <p className="mt-2 text-sm text-black/60">
        「<span className="font-medium text-neutral-800">{householdName}</span>」への参加を申請します。オーナーの承認後に参加できます。
      </p>
      {done && !error ? (
        <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-sm text-black/70">
          {doneMessage ?? "申請しました。承認されるまでしばらくお待ちください。"}
        </div>
      ) : null}
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}
      {needsAuth ? (
        <div className="mt-4 grid gap-2">
          <a href={loginUrl} className="w-full rounded-xl bg-black px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-black/90">
            ログインして続ける
          </a>
          <a
            href={signupUrl}
            className="w-full rounded-xl border border-black/15 bg-white px-4 py-2.5 text-center text-sm font-medium text-neutral-900 hover:bg-black/[0.03]"
          >
            新規登録して続ける
          </a>
        </div>
      ) : null}
      {done ? (
        <div className="mt-4">
          <a
            href="/dashboard"
            className="block w-full rounded-xl bg-black px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-black/90"
          >
            この家計簿を開く
          </a>
        </div>
      ) : null}
      {!done ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setDoneMessage(null);
            startTransition(async () => {
              const res = await acceptHouseholdInvite(token);
              if (!res.ok) {
                setError(res.message);
                setDone(false);
              } else {
                setDone(true);
                setDoneMessage((res as any).message ?? null);
              }
            });
          }}
          className="mt-6 w-full rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-60"
        >
          {pending ? "処理中…" : "参加を申請する"}
        </button>
      ) : null}
    </div>
  );
}
