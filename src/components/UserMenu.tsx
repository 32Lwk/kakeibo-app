"use client";

import { signOut } from "next-auth/react";

export function UserMenu({ email }: { email?: string | null }) {
  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      <span className="text-black/60">{email}</span>
      <button
        onClick={() => void signOut({ callbackUrl: "/login" })}
        className="rounded-lg border border-black/15 px-3 py-1.5 hover:bg-black/[0.03]"
      >
        ログアウト
      </button>
    </div>
  );
}

