"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">ログイン</h1>
        <p className="mt-2 text-sm text-black/60">
          Google またはメールアドレスでログインできます。
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const formData = new FormData(e.currentTarget);
            const res = await signIn("credentials", {
              redirect: false,
              email: String(formData.get("email") ?? ""),
              password: String(formData.get("password") ?? ""),
              callbackUrl: "/dashboard",
            });
            if (res?.error) {
              setError("メールアドレスまたはパスワードが違います。");
              return;
            }
            router.push("/dashboard");
          }}
        >
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="email">
              メールアドレス
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-black/15 px-3 py-2 outline-none focus:border-black/40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="password">
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-xl border border-black/15 px-3 py-2 outline-none focus:border-black/40"
            />
          </div>
          <button className="w-full rounded-xl bg-black px-3 py-2 text-white hover:bg-black/90">
            ログイン
          </button>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </form>

        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn("google", { callbackUrl: "/dashboard" });
          }}
        >
          <button className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-black hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30">
            Googleでログイン
          </button>
        </form>

        <div className="mt-6 text-sm">
          <a className="underline" href="/signup">
            アカウント作成
          </a>
        </div>
      </div>
    </div>
  );
}

