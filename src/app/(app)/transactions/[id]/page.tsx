import { prisma } from "@/lib/db";
import { requireAuthedContext, requireRole, scopedTx } from "@/lib/authz";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TransactionForm } from "@/components/TransactionForm";
import type { SplitDraft } from "@/components/SplitEditor";

export const dynamic = "force-dynamic";

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

const updateSchema = z.object({
  type: z.enum(["expense", "income"]),
  purchaseDate: z.string().min(1),
  totalAmount: z.coerce.number().int().min(0),
  memo: z.string().optional(),
  splitsJson: z.string().min(1),
});

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAuthedContext({ onUnauthorized: "redirect" });
  const txWhere = scopedTx(ctx);
  const { id } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const backRaw = sp?.back;
  const back = (Array.isArray(backRaw) ? backRaw[0] : backRaw) ?? "";
  const backSafe =
    back.startsWith("/") && !back.startsWith("//") && !back.includes("\n") && !back.includes("\r") ? back : "";

  const tx = await prisma.transaction.findFirst({
    where: { id, ...txWhere },
    select: {
      id: true,
      type: true,
      purchaseDate: true,
      totalAmount: true,
      memo: true,
      splits: { select: { categoryId: true, amount: true }, orderBy: { createdAt: "asc" } },
      refundFrom: { select: { id: true } },
      refundTo: { select: { id: true, refundTransactionId: true } },
    },
  });
  if (!tx) return null;

  const isEditor = ctx.role === "owner" || ctx.role === "editor";
  const categories = await prisma.category.findMany({
    where: { householdId: ctx.householdId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const categoryIds = new Set(categories.map((c) => c.id));

  const initialSplits: SplitDraft[] =
    tx.splits.length > 0
      ? tx.splits.filter((s) => categoryIds.has(s.categoryId)).map((s) => ({ categoryId: s.categoryId, amount: s.amount }))
      : (() => {
          const uncategorized = categories.find((c) => c.name === "未分類") ?? categories[0];
          return uncategorized ? ([{ categoryId: uncategorized.id, amount: tx.totalAmount }] satisfies SplitDraft[]) : [];
        })();

  async function updateAction(formData: FormData) {
    "use server";
    const ctx = await requireAuthedContext();
    requireRole(ctx, "editor");
    const scope = scopedTx(ctx);

    const parsed = updateSchema.safeParse({
      type: formData.get("type"),
      purchaseDate: formData.get("purchaseDate"),
      totalAmount: formData.get("totalAmount"),
      memo: String(formData.get("memo") ?? "") || undefined,
      splitsJson: String(formData.get("splitsJson") ?? ""),
    });
    if (!parsed.success) throw new Error("入力が不正です。");

    const raw = parsed.data;
    const purchaseDate = new Date(raw.purchaseDate);

    const categories = await prisma.category.findMany({
      where: { householdId: ctx.householdId },
      select: { id: true },
    });
    const categoryIds = new Set(categories.map((c) => c.id));

    const splits = z
      .array(
        z.object({
          categoryId: z.string().min(1),
          amount: z.coerce.number().int().min(0),
        }),
      )
      .safeParse(JSON.parse(raw.splitsJson));
    if (!splits.success) throw new Error("内訳の形式が不正です。");
    if (splits.data.length === 0) throw new Error("内訳が空です。");
    const sum = splits.data.reduce((a, s) => a + s.amount, 0);
    if (sum !== raw.totalAmount) throw new Error("内訳の合計が一致しません。");
    if (splits.data.some((s) => !categoryIds.has(s.categoryId))) throw new Error("カテゴリが不正です。");

    const current = await prisma.transaction.findFirst({
      where: { id, ...scope },
      select: { id: true },
    });
    if (!current) throw new Error("明細が見つかりません。");

    await prisma.$transaction(async (txPrisma) => {
      await txPrisma.transaction.update({
        where: { id: current.id },
        data: {
          type: raw.type,
          purchaseDate,
          totalAmount: raw.totalAmount,
          memo: raw.memo,
        },
      });

      await txPrisma.transactionSplit.deleteMany({ where: { transactionId: current.id } });
      await txPrisma.transactionSplit.createMany({
        data: splits.data.map((s) => ({ transactionId: current.id, categoryId: s.categoryId, amount: s.amount })),
      });

      await txPrisma.auditLog.create({
        data: {
          userId: ctx.userId,
          action: "update",
          entityType: "transaction",
          entityId: current.id,
        },
      });
    });

    const back = String(formData.get("back") ?? "");
    const backSafe =
      back.startsWith("/") && !back.startsWith("//") && !back.includes("\n") && !back.includes("\r") ? back : "";
    redirect(backSafe ? `/transactions/${id}?back=${encodeURIComponent(backSafe)}` : `/transactions/${id}`);
  }

  return (
    <div className="space-y-6">
      {tx.refundTo ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          この取引は返金を作成済みです（返金明細ID: <span className="font-mono">{tx.refundTo.refundTransactionId}</span>）。
        </div>
      ) : null}

      <TransactionForm
        title="明細の編集"
        submitLabel="保存"
        action={updateAction}
        categories={categories}
        initial={{
          type: tx.type,
          purchaseDate: tx.purchaseDate.toISOString().slice(0, 10),
          totalAmount: tx.totalAmount,
          memo: tx.memo ?? "",
          splits: initialSplits,
        }}
        disabled={!isEditor}
        showBackHref={backSafe || "/transactions"}
        hiddenFields={{ back: backSafe }}
      />

      <div className="flex flex-wrap gap-2">
        <form
          action={async () => {
            "use server";
            const ctx = await requireAuthedContext();
            requireRole(ctx, "editor");
            const scope = scopedTx(ctx);

            const current = await prisma.transaction.findFirst({
              where: { id, ...scope },
              select: { id: true, refundTo: { select: { id: true } } },
            });
            if (!current) throw new Error("明細が見つかりません。");
            if (current.refundTo) throw new Error("返金は既に作成済みです。");

            const original = await prisma.transaction.findUnique({
              where: { id: current.id },
              select: { id: true, type: true, purchaseDate: true, totalAmount: true, memo: true, layerId: true },
            });
            if (!original) throw new Error("明細が見つかりません。");

            const refundType = original.type === "expense" ? "income" : "expense";
            const refundMemo = original.memo ? `返金: ${original.memo}` : "返金";

            const created = await prisma.$transaction(async (txPrisma) => {
              const refundTx = await txPrisma.transaction.create({
                data: {
                  householdId: ctx.householdId,
                  layerId: original.layerId,
                  type: refundType,
                  purchaseDate: new Date(),
                  totalAmount: original.totalAmount,
                  memo: refundMemo,
                  accountType: "cash",
                  splits: {
                    create: [],
                  },
                },
                select: { id: true },
              });

              const uncategorized = await txPrisma.category.findFirst({
                where: { householdId: ctx.householdId, name: "未分類" },
                select: { id: true },
              });
              if (!uncategorized) throw new Error("未分類カテゴリが見つかりません。");

              await txPrisma.transactionSplit.create({
                data: { transactionId: refundTx.id, categoryId: uncategorized.id, amount: original.totalAmount },
              });

              await txPrisma.refund.create({
                data: {
                  originalTransactionId: original.id,
                  refundTransactionId: refundTx.id,
                },
                select: { id: true, refundTransactionId: true },
              });

              await txPrisma.auditLog.create({
                data: {
                  userId: ctx.userId,
                  action: "create_refund",
                  entityType: "refund",
                  entityId: original.id,
                },
              });

              return refundTx;
            });

            redirect(`/transactions/${created.id}`);
          }}
        >
          <button className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-40" disabled={!isEditor || !!tx.refundTo}>
            返金を作成
          </button>
        </form>

        <form
          action={async () => {
            "use server";
            const ctx = await requireAuthedContext();
            requireRole(ctx, "editor");
            const scope = scopedTx(ctx);

            const current = await prisma.transaction.findFirst({
              where: { id, ...scope },
              select: { id: true },
            });
            if (!current) throw new Error("明細が見つかりません。");

            await prisma.$transaction(async (txPrisma) => {
              await txPrisma.transaction.delete({ where: { id: current.id } });
              await txPrisma.auditLog.create({
                data: {
                  userId: ctx.userId,
                  action: "delete",
                  entityType: "transaction",
                  entityId: current.id,
                },
              });
            });

            redirect("/transactions");
          }}
        >
          <button className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-40" disabled={!isEditor}>
            削除（復元不可）
          </button>
        </form>
      </div>
    </div>
  );
}

