import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthedContext, requireRole } from "@/lib/authz";
import { TransactionForm } from "@/components/TransactionForm";

export const dynamic = "force-dynamic";

const schema = z.object({
  type: z.enum(["expense", "income"]),
  purchaseDate: z.string().min(1),
  totalAmount: z.coerce.number().int().min(0),
  memo: z.string().optional(),
  splitsJson: z.string().min(1),
});

export default async function NewTransactionPage() {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "editor");

  const categories = await prisma.category.findMany({
    where: { householdId: ctx.householdId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const uncategorized = categories.find((c) => c.name === "未分類");
  if (!uncategorized) throw new Error("未分類カテゴリが見つかりません。");

  async function action(formData: FormData) {
    "use server";
    const ctx = await requireAuthedContext();
    requireRole(ctx, "editor");
    const parsed = schema.safeParse({
      type: formData.get("type"),
      purchaseDate: formData.get("purchaseDate"),
      totalAmount: formData.get("totalAmount"),
      memo: String(formData.get("memo") ?? "") || undefined,
      splitsJson: String(formData.get("splitsJson") ?? ""),
    });
    if (!parsed.success) throw new Error("入力が不正です。");

    const raw = parsed.data;
    const purchaseDate = new Date(raw.purchaseDate);

    const splits = z
      .array(
        z.object({
          categoryId: z.string().min(1),
          amount: z.coerce.number().int().min(0),
        }),
      )
      .safeParse(JSON.parse(raw.splitsJson));
    if (!splits.success) throw new Error("内訳の形式が不正です。");
    const sum = splits.data.reduce((a, s) => a + s.amount, 0);
    if (sum !== raw.totalAmount) throw new Error("内訳の合計が一致しません。");

    const categoryIds = new Set(categories.map((c) => c.id));
    if (splits.data.some((s) => !categoryIds.has(s.categoryId))) throw new Error("カテゴリが不正です。");

    const tx = await prisma.transaction.create({
      data: {
        householdId: ctx.householdId,
        type: raw.type,
        purchaseDate,
        totalAmount: raw.totalAmount,
        memo: raw.memo,
        accountType: "cash",
        splits: {
          create: splits.data.map((s) => ({ categoryId: s.categoryId, amount: s.amount })),
        },
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "create",
        entityType: "transaction",
        entityId: tx.id,
      },
    });

    redirect("/transactions");
  }

  return (
    <TransactionForm
      title="明細を追加"
      submitLabel="保存"
      action={action}
      categories={categories}
      headerRight={
        <a
          href="/receipts/new"
          className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-black/80 hover:bg-black/[0.03]"
        >
          レシートから作成
        </a>
      }
      initial={{
        type: "expense",
        purchaseDate: new Date().toISOString().slice(0, 10),
        totalAmount: 0,
        memo: "",
        splits: [{ categoryId: uncategorized.id, amount: 0 }],
      }}
      showBackHref="/transactions"
    />
  );
}

