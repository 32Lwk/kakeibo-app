import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { JoinClient } from "./JoinClient";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ invite?: string }> };

export default async function JoinPage({ searchParams }: Props) {
  const { invite: tokenRaw } = await searchParams;
  const token = typeof tokenRaw === "string" ? tokenRaw.trim() : "";

  if (!token) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-5 py-12 text-center">
        <p className="text-sm text-neutral-600">招待リンクが無効です。</p>
        <a href="/dashboard" className="mt-4 text-sm font-medium text-neutral-900 underline">
          ホームへ
        </a>
      </div>
    );
  }

  const invite = await prisma.householdInvite.findUnique({
    where: { token },
    include: { household: { select: { name: true } } },
  });

  if (!invite || invite.expiresAt.getTime() < Date.now()) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-5 py-12 text-center">
        <p className="text-sm text-neutral-600">
          招待が見つからないか、有効期限が切れています。
        </p>
        <a href="/login" className="mt-4 text-sm font-medium text-neutral-900 underline">
          ログインへ
        </a>
      </div>
    );
  }

  const session = await getSession();
  if (!session?.user) {
    const callbackUrl = `/join?invite=${encodeURIComponent(token)}`;
    const loginUrl = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    const signupUrl = `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-5 py-12">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 text-neutral-900 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-950">家計簿への招待</h1>
          <p className="mt-2 text-sm text-black/60">
            「<span className="font-medium text-neutral-800">{invite.household.name}</span>」への参加申請にはログインが必要です。
          </p>
          <div className="mt-6 grid gap-2">
            <a href={loginUrl} className="w-full rounded-xl bg-black px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-black/90">
              ログインして続ける
            </a>
            <a href={signupUrl} className="w-full rounded-xl border border-black/15 bg-white px-4 py-2.5 text-center text-sm font-medium text-neutral-900 hover:bg-black/[0.03]">
              新規登録して続ける
            </a>
          </div>
          <p className="mt-4 text-[11px] text-black/45">
            ログイン/登録後にこのページへ戻り、そのまま参加申請できます。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-5 py-12">
      <JoinClient token={token} householdName={invite.household.name} />
    </div>
  );
}
