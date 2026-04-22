import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  type: z.enum(["expense", "income"]),
  purchaseDate: z.string().min(1),
  totalAmount: z.coerce.number().int().min(0),
  memo: z.string().optional(),
});

export default async function NewTransactionPage() {
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
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">明細を追加</h1>

      <form
        className="max-w-xl space-y-4 rounded-2xl border border-black/10 bg-white p-6"
        action={async (formData) => {
          "use server";
          const parsed = schema.safeParse({
            type: formData.get("type"),
            purchaseDate: formData.get("purchaseDate"),
            totalAmount: formData.get("totalAmount"),
            memo: String(formData.get("memo") ?? "") || undefined,
          });
          if (!parsed.success) throw new Error("入力が不正です。");

          const raw = parsed.data;
          const purchaseDate = new Date(raw.purchaseDate);

          const uncategorized = await prisma.category.findFirst({
            where: { householdId: membership.householdId, name: "未分類" },
            select: { id: true },
          });
          if (!uncategorized) throw new Error("未分類カテゴリが見つかりません。");

          const tx = await prisma.transaction.create({
            data: {
              householdId: membership.householdId,
              type: raw.type,
              purchaseDate,
              totalAmount: raw.totalAmount,
              memo: raw.memo,
              accountType: "cash",
              splits: {
                create: [{ categoryId: uncategorized.id, amount: raw.totalAmount }],
              },
            },
            select: { id: true },
          });

          await prisma.auditLog.create({
            data: {
              userId,
              action: "create",
              entityType: "transaction",
              entityId: tx.id,
            },
          });

          redirect("/transactions");
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="type">
              種別
            </label>
            <select
              id="type"
              name="type"
              className="w-full rounded-xl border border-black/15 px-3 py-2"
              defaultValue="expense"
            >
              <option value="expense">支出</option>
              <option value="income">収入</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="purchaseDate">
              日付
            </label>
            <input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              required
              className="w-full rounded-xl border border-black/15 px-3 py-2"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="totalAmount">
            金額（円）
          </label>
          <input
            id="totalAmount"
            name="totalAmount"
            type="number"
            inputMode="numeric"
            required
            min={0}
            className="w-full rounded-xl border border-black/15 px-3 py-2"
          />
          <div className="text-xs text-black/50">
            分割は次のステップで追加します（いまは未分類に一括で入ります）。
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="memo">
            メモ（店名もここに）
          </label>
          <input
            id="memo"
            name="memo"
            className="w-full rounded-xl border border-black/15 px-3 py-2"
          />
        </div>

        <div className="pt-2">
          <button className="w-full rounded-xl bg-black px-3 py-2 text-white hover:bg-black/90">
            保存
          </button>
        </div>
      </form>

      <div className="text-sm text-black/60">
        カテゴリ（{categories.length}件）は帳簿に登録されています。分割UIで活用します。
      </div>
    </div>
  );
}

