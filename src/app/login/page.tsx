"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  const messages: Record<string, string> = {
    OAuthSignin: "Google への接続に失敗しました。しばらくしてから再度お試しください。",
    OAuthCallback: "Google からの戻り処理に失敗しました。ブラウザのブロックや別タブで開いていないか確認し、もう一度お試しください。",
    OAuthCreateAccount: "アカウントの作成に失敗しました。",
    OAuthAccountNotLinked:
      "このメールアドレスは別のログイン方法ですでに登録されています。メール＋パスワードでログインするか、設定で連携を確認してください。",
    Callback: "認証処理でエラーが発生しました。もう一度お試しください。",
    AccessDenied: "ログインがキャンセルされたか、アクセスが拒否されました。",
    Configuration: "認証の設定（環境変数・Google のリダイレクト URI など）を確認してください。",
  };
  return messages[code] ?? `ログインに失敗しました（${code}）。`;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const oauthError = useMemo(
    () => oauthErrorMessage(searchParams.get("error")),
    [searchParams],
  );

  const postLoginPath = useMemo(() => {
    const raw = searchParams.get("callbackUrl");
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
    return raw;
  }, [searchParams]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 text-neutral-900 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">ログイン</h1>
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
              callbackUrl: `${window.location.origin}${postLoginPath}`,
            });
            if (res?.error) {
              setError("メールアドレスまたはパスワードが違います。");
              return;
            }
            router.push(postLoginPath);
          }}
        >
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
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-black/40"
            />
          </div>
          <button className="w-full rounded-xl bg-black px-3 py-2 text-white hover:bg-black/90">
            ログイン
          </button>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </form>

        {oauthError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {oauthError}
          </div>
        )}

        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn("google", {
              callbackUrl: `${window.location.origin}${postLoginPath}`,
            });
          }}
        >
          <button className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-black hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30">
            Googleでログイン
          </button>
        </form>

        <div className="mt-6 text-sm">
          <a
            className="font-medium text-neutral-800 underline decoration-neutral-400 underline-offset-2 hover:text-neutral-950"
            href="/signup"
          >
            アカウント作成
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center px-6 py-12 text-sm text-neutral-600">
          読み込み中…
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

