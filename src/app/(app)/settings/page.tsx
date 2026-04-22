import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { weekStartsOn: true, email: true },
  });
  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">設定</h1>

      <form
        className="max-w-xl space-y-4 rounded-2xl border border-black/10 bg-white p-6"
        action={async (formData) => {
          "use server";
          const weekStartsOn = Number(formData.get("weekStartsOn"));
          if (![0, 1, 6].includes(weekStartsOn)) throw new Error("不正な値です。");
          await prisma.user.update({
            where: { id: userId },
            data: { weekStartsOn },
          });
          redirect("/settings");
        }}
      >
        <div className="text-sm text-black/60">ログイン中: {user.email}</div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="weekStartsOn">
            カレンダー開始曜日
          </label>
          <select
            id="weekStartsOn"
            name="weekStartsOn"
            defaultValue={String(user.weekStartsOn)}
            className="w-full rounded-xl border border-black/15 px-3 py-2"
          >
            <option value="0">日曜</option>
            <option value="1">月曜</option>
            <option value="6">土曜</option>
          </select>
          <div className="text-xs text-black/50">
            表示のみの設定です（帳簿単位ではなくユーザー単位）。
          </div>
        </div>

        <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90">
          保存
        </button>
      </form>
    </div>
  );
}

