"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 text-neutral-900 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">アカウント作成</h1>
        <p className="mt-2 text-sm text-black/60">
          メールアドレスとパスワードで作成します（8文字以上）。
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const formData = new FormData(e.currentTarget);
            const payload = {
              name: String(formData.get("name") ?? "") || undefined,
              email: String(formData.get("email") ?? ""),
              password: String(formData.get("password") ?? ""),
            };
            const res = await fetch("/api/signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const json = (await res.json().catch(() => null)) as any;
              setError(json?.message ?? "作成に失敗しました。");
              return;
            }

            const login = await signIn("credentials", {
              redirect: false,
              email: payload.email,
              password: payload.password,
              callbackUrl: "/dashboard",
            });
            if (login?.error) {
              setError("ログインに失敗しました。");
              return;
            }
            router.push("/dashboard");
          }}
        >
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-800" htmlFor="name">
              名前（任意）
            </label>
            <input
              id="name"
              name="name"
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-black/40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-800" htmlFor="email">
              メールアドレス
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-black/40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-800" htmlFor="password">
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-black/40"
            />
          </div>
          <button className="w-full rounded-xl bg-black px-3 py-2 text-white hover:bg-black/90">
            作成してログイン
          </button>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </form>

        <div className="mt-6 text-sm">
          <a
            className="font-medium text-neutral-800 underline decoration-neutral-400 underline-offset-2 hover:text-neutral-950"
            href="/login"
          >
            ログインへ戻る
          </a>
        </div>
      </div>
    </div>
  );
}

