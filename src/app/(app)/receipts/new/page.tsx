import { prisma } from "@/lib/db";
import { requireAuthedContext, requireRole, scopedTx } from "@/lib/authz";
import { saveUpload } from "@/lib/storage";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewReceiptPage() {
  const ctx = await requireAuthedContext({ onUnauthorized: "redirect" });
  requireRole(ctx, "editor");

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">レシートを追加</h1>
        <a className="text-sm underline" href="/receipts">
          一覧へ
        </a>
      </div>

      <form
        className="max-w-xl space-y-4 rounded-2xl border border-black/10 bg-white p-6"
        action={async (formData) => {
          "use server";
          const ctx = await requireAuthedContext();
          requireRole(ctx, "editor");
          const rxWhere = scopedTx(ctx);

          const file = formData.get("file");
          if (!(file instanceof File)) throw new Error("画像ファイルを選択してください。");
          if (!file.type.startsWith("image/")) throw new Error("画像ファイルのみ対応しています。");

          const receipt = await prisma.receipt.create({
            data: { householdId: rxWhere.householdId, layerId: rxWhere.layerId, status: "pending" },
            select: { id: true },
          });

          const bytes = new Uint8Array(await file.arrayBuffer());
          const { key } = await saveUpload({
            folder: `receipt_${receipt.id}`,
            fileName: `${Date.now()}_${file.name}`,
            bytes,
          });

          const att = await prisma.attachment.create({
            data: {
              householdId: ctx.householdId,
              kind: "receipt",
              mimeType: file.type,
              fileName: file.name,
              gcsObjectKey: key,
              receiptId: receipt.id,
            },
            select: { id: true },
          });

          await prisma.auditLog.create({
            data: {
              userId: ctx.userId,
              action: "create",
              entityType: "receipt",
              entityId: receipt.id,
              metadata: { attachmentId: att.id },
            },
          });

          redirect(`/receipts/${receipt.id}`);
        }}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="file">
            画像
          </label>
          <input id="file" name="file" type="file" accept="image/*" required />
          <div className="text-xs text-black/50">まずは画像1枚のアップロードに対応します（複数/トリミングは次の段階）。</div>
        </div>

        <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90">アップロード</button>
      </form>
    </div>
  );
}

