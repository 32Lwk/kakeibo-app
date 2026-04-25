import { prisma } from "@/lib/db";
import { requireAuthedContext, requireRole, scopedTx } from "@/lib/authz";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runVisionOcr, structureWithOpenAI } from "@/lib/receiptProcessing";
import { ReceiptConfirmForm } from "@/components/ReceiptConfirmForm";
import { deleteStoredObject } from "@/lib/storage";
import { assertAiBudgetForUser, receiptImageKeep } from "@/lib/guardrails";

export const dynamic = "force-dynamic";

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

const confirmSchema = z.object({
  storeName: z.string().optional(),
  purchaseDate: z.string().min(1),
  totalAmount: z.coerce.number().int().min(0),
  memo: z.string().optional(),
  splitsJson: z.string().min(1),
});

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthedContext({ onUnauthorized: "redirect" });
  const rxWhere = scopedTx(ctx);
  const { id } = await params;

  const receipt = await prisma.receipt.findFirst({
    where: { id, ...rxWhere },
    select: {
      id: true,
      status: true,
      storeName: true,
      purchaseDate: true,
      totalAmount: true,
      ocrText: true,
      structuredJson: true,
      attachments: { select: { id: true, mimeType: true, fileName: true } },
      createdAt: true,
    },
  });
  if (!receipt) return null;

  const categories = await prisma.category.findMany({
    where: { householdId: ctx.householdId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const uncategorized = categories.find((c) => c.name === "未分類") ?? categories[0];
  if (!uncategorized) throw new Error("カテゴリが見つかりません。");

  const isEditor = ctx.role === "owner" || ctx.role === "editor";

  const structured = receipt.structuredJson as any;
  const suggestedDate =
    typeof structured?.purchaseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(structured.purchaseDate)
      ? structured.purchaseDate
      : receipt.purchaseDate
        ? receipt.purchaseDate.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
  const suggestedTotal =
    typeof structured?.totalAmount === "number" ? Math.trunc(structured.totalAmount) : receipt.totalAmount ?? 0;
  const suggestedStore =
    typeof structured?.storeName === "string" ? structured.storeName : receipt.storeName ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">レシート</h1>
          <div className="text-sm text-black/60">
            status: <span className="font-mono">{receipt.status}</span>
          </div>
        </div>
        <a className="text-sm underline" href="/receipts">
          一覧へ
        </a>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-black/10 bg-white p-5">
          <div className="text-sm font-medium">画像</div>
          <div className="mt-3 space-y-3">
            {receipt.attachments.length === 0 ? (
              <div className="text-sm text-black/60">画像がありません。</div>
            ) : (
              receipt.attachments.map((a) => (
                <div key={a.id} className="space-y-2">
                  <div className="text-xs text-black/50">{a.fileName ?? a.id}</div>
                  <img src={`/attachments/${a.id}`} alt="" className="w-full rounded-xl border border-black/10" />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-black/10 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">解析</div>
            <form
              action={async () => {
                "use server";
                const ctx = await requireAuthedContext();
                requireRole(ctx, "editor");
                const scope = scopedTx(ctx);

                const receipt = await prisma.receipt.findFirst({
                  where: { id, ...scope },
                  select: {
                    id: true,
                    attachments: { select: { id: true, gcsObjectKey: true } },
                    status: true,
                  },
                });
                if (!receipt) throw new Error("レシートが見つかりません。");
                if (receipt.attachments.length === 0) throw new Error("画像がありません。");

                await prisma.receipt.update({
                  where: { id: receipt.id },
                  data: { status: "pending" },
                });

                try {
                  // MVP: 1枚目だけ解析
                  const att = await prisma.attachment.findFirst({
                    where: { id: receipt.attachments[0]!.id, householdId: ctx.householdId },
                    select: { gcsObjectKey: true },
                  });
                  if (!att) throw new Error("画像が見つかりません。");

                  const bytes = await (await import("@/lib/storage")).readStoredObject(att.gcsObjectKey);
                  const ocrText = await runVisionOcr(bytes.bytes);
                  await prisma.receipt.update({
                    where: { id: receipt.id },
                    data: { ocrText, status: "ocr_done" },
                  });

                  await assertAiBudgetForUser(ctx.userId);
                  const structured = await structureWithOpenAI(ocrText);
                  await prisma.receipt.update({
                    where: { id: receipt.id },
                    data: {
                      storeName: structured.storeName ?? null,
                      purchaseDate: structured.purchaseDate ? new Date(structured.purchaseDate) : null,
                      totalAmount: structured.totalAmount ?? null,
                      structuredJson: structured as any,
                      status: "structured_done",
                    },
                  });

                  await prisma.auditLog.create({
                    data: {
                      userId: ctx.userId,
                      action: "analyze",
                      entityType: "receipt",
                      entityId: receipt.id,
                    },
                  });
                } catch (e: any) {
                  await prisma.receipt.update({
                    where: { id: receipt.id },
                    data: { status: "failed", structuredJson: { error: String(e?.message ?? e) } as any },
                  });
                  throw e;
                }

                redirect(`/receipts/${receipt.id}`);
              }}
            >
              <button
                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-40"
                disabled={!isEditor}
              >
                解析する
              </button>
            </form>
          </div>

          <div className="mt-3 space-y-3 text-sm">
            <div className="text-black/60">OCR/構造化結果は右の「登録」フォームに反映されます。</div>
            {receipt.ocrText ? (
              <details className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                <summary className="cursor-pointer text-sm font-medium">OCRテキスト（確認用）</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-black/70">{receipt.ocrText}</pre>
              </details>
            ) : null}
          </div>
        </section>
      </div>

      <ReceiptConfirmForm
        categories={categories}
        disabled={!isEditor}
        initial={{
          storeName: suggestedStore,
          purchaseDate: suggestedDate,
          totalAmount: suggestedTotal,
          memo: rawMemoFromStructured(structured, suggestedStore),
          splits: [{ categoryId: uncategorized.id, amount: suggestedTotal }],
        }}
        action={async (formData) => {
          "use server";
          const ctx = await requireAuthedContext();
          requireRole(ctx, "editor");
          const scope = scopedTx(ctx);

          const parsed = confirmSchema.safeParse({
            storeName: String(formData.get("storeName") ?? "") || undefined,
            purchaseDate: String(formData.get("purchaseDate") ?? ""),
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
          const sum = splits.data.reduce((a, s) => a + s.amount, 0);
          if (sum !== raw.totalAmount) throw new Error("内訳の合計が一致しません。");
          if (splits.data.some((s) => !categoryIds.has(s.categoryId))) throw new Error("カテゴリが不正です。");

          const receipt = await prisma.receipt.findFirst({
            where: { id, ...scope },
            select: { id: true, layerId: true },
          });
          if (!receipt) throw new Error("レシートが見つかりません。");

          const tx = await prisma.$transaction(async (txPrisma) => {
            const created = await txPrisma.transaction.create({
              data: {
                householdId: ctx.householdId,
                layerId: receipt.layerId,
                type: "expense",
                purchaseDate,
                totalAmount: raw.totalAmount,
                memo: raw.memo || (raw.storeName ? `レシート: ${raw.storeName}` : "レシート"),
                accountType: "cash",
                splits: { create: splits.data.map((s) => ({ categoryId: s.categoryId, amount: s.amount })) },
              },
              select: { id: true },
            });

            await txPrisma.receipt.update({
              where: { id: receipt.id },
              data: {
                storeName: raw.storeName ?? null,
                purchaseDate,
                totalAmount: raw.totalAmount,
                status: "confirmed",
              },
            });

            // Apply image retention policy after confirmation
            if (!receiptImageKeep()) {
              const atts = await txPrisma.attachment.findMany({
                where: { receiptId: receipt.id, householdId: ctx.householdId },
                select: { id: true, gcsObjectKey: true },
              });
              for (const a of atts) {
                await deleteStoredObject(a.gcsObjectKey);
              }
              await txPrisma.attachment.deleteMany({ where: { receiptId: receipt.id, householdId: ctx.householdId } });
            }

            await txPrisma.auditLog.create({
              data: {
                userId: ctx.userId,
                action: "confirm",
                entityType: "receipt",
                entityId: receipt.id,
                metadata: { transactionId: created.id },
              },
            });
            return created;
          });

          redirect(`/transactions/${tx.id}`);
        }}
      />
    </div>
  );
}

function rawMemoFromStructured(structured: any, storeName: string) {
  const memo = typeof structured?.memo === "string" ? structured.memo : "";
  if (memo.trim()) return memo;
  return storeName ? `レシート: ${storeName}` : "レシート";
}

