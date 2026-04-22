import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RecurringSettingsPage() {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId },
    select: { householdId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;

  const categories = await prisma.category.findMany({
    where: { householdId: membership.householdId },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const rules = await prisma.recurringRule.findMany({
    where: { householdId: membership.householdId },
    orderBy: [{ isActive: "desc" }, { dayOfMonth: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      isActive: true,
      type: true,
      dayOfMonth: true,
      amount: true,
      memo: true,
      accountType: true,
      startMonth: true,
      category: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">固定費・定期収入</h1>
          <p className="text-sm text-black/60">一度登録すれば、月を開いたタイミングで自動反映されます。</p>
        </div>
        <a className="text-sm underline" href="/settings">
          設定に戻る
        </a>
      </div>

      <form
        className="max-w-2xl space-y-4 rounded-2xl border border-black/10 bg-white p-6"
        action={async (formData) => {
          "use server";
          const type = String(formData.get("type") ?? "expense");
          const dayOfMonth = Number(formData.get("dayOfMonth"));
          const amount = Number(formData.get("amount"));
          const memo = String(formData.get("memo") ?? "").trim();
          const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
          const accountType = String(formData.get("accountType") ?? "").trim() || null;
          const startMonth = String(formData.get("startMonth") ?? "").trim() || null;

          if (!["expense", "income"].includes(type)) throw new Error("不正な値です。");
          if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) throw new Error("不正な値です。");
          if (!Number.isFinite(amount) || amount <= 0) throw new Error("不正な値です。");
          if (categoryId && !categories.some((c) => c.id === categoryId)) throw new Error("不正な値です。");
          if (startMonth && !/^\d{4}-\d{2}$/.test(startMonth)) throw new Error("不正な値です。");

          await prisma.recurringRule.create({
            data: {
              householdId: membership.householdId,
              type: type as any,
              dayOfMonth,
              amount: Math.trunc(amount),
              memo: memo || null,
              categoryId,
              accountType,
              startMonth: startMonth ?? undefined,
            },
          });

          redirect("/settings/recurring");
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="type">
              種別
            </label>
            <select id="type" name="type" className="w-full rounded-xl border border-black/15 bg-white px-3 py-2">
              <option value="expense">固定費（支出）</option>
              <option value="income">定期収入</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="dayOfMonth">
              毎月の何日
            </label>
            <select
              id="dayOfMonth"
              name="dayOfMonth"
              defaultValue="1"
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2"
            >
              {Array.from({ length: 28 }).map((_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {i + 1}日
                </option>
              ))}
            </select>
            <div className="text-xs text-black/50">月末のブレを避けるため 28日までに制限しています。</div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="amount">
              金額（円）
            </label>
            <input
              id="amount"
              name="amount"
              inputMode="numeric"
              placeholder="例: 7800"
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="categoryId">
              カテゴリ（任意）
            </label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue=""
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2"
            >
              <option value="">未指定</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="memo">
              メモ（任意）
            </label>
            <input
              id="memo"
              name="memo"
              placeholder="例: 家賃 / サブスク / 奨学金 など"
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="accountType">
              口座（任意）
            </label>
            <input
              id="accountType"
              name="accountType"
              placeholder="例: cash / bank / credit"
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2"
            />
            <div className="text-xs text-black/50">繰越（口座別）の対象にもなります。</div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="startMonth">
              いつから適用（任意）
            </label>
            <input
              id="startMonth"
              name="startMonth"
              type="month"
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">ヒント</div>
            <div className="text-sm text-black/60">生成は「月を開いたとき」に行われ、二重登録されません。</div>
          </div>
        </div>

        <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90">追加</button>
      </form>

      <section className="max-w-2xl rounded-2xl border border-black/10 bg-white">
        <div className="border-b border-black/10 px-6 py-4">
          <div className="text-sm font-medium">登録済みルール</div>
          <div className="text-sm text-black/60">（編集/削除は次ステップ）</div>
        </div>
        <div className="divide-y divide-black/10">
          {rules.length === 0 ? (
            <div className="p-6 text-sm text-black/60">まだ登録がありません。</div>
          ) : (
            rules.map((r) => (
              <div key={r.id} className="px-6 py-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-black/80">{r.memo ?? "（メモなし）"}</div>
                  <span
                    className={[
                      "rounded-full px-2 py-1 text-[11px] font-medium",
                      r.isActive ? "bg-black text-white" : "bg-black/[0.06] text-black/60",
                    ].join(" ")}
                  >
                    {r.isActive ? "有効" : "無効"}
                  </span>
                </div>
                <div className="mt-1 text-black/60">
                  {r.type === "income" ? "定期収入" : "固定費"} / {r.dayOfMonth}日 / ¥
                  {new Intl.NumberFormat("ja-JP").format(r.amount)}
                  {r.category?.name ? ` / ${r.category.name}` : ""}
                  {r.accountType ? ` / ${r.accountType}` : ""}
                  {r.startMonth ? ` / ${r.startMonth}〜` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

