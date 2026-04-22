"use client";

import { signOut } from "next-auth/react";

export function UserMenu({ email }: { email?: string | null }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-black/60 lg:inline">{email}</span>
      <button
        onClick={() => void signOut({ callbackUrl: "/login" })}
        className="rounded-xl border border-black/10 bg-white px-3 py-1.5 font-medium text-black/80 hover:bg-black/[0.05] hover:text-black"
      >
        ログアウト
      </button>
    </div>
  );
}

