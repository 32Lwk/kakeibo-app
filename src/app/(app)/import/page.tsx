import { requireAuthedContext, requireRole } from "@/lib/authz";
import { ImportStartClient } from "./ImportStartClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "editor");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">CSV取込</h1>
        <p className="text-sm text-black/60">
          まずは `amounts.csv` 互換（列: 金額,日付,メモ,カテゴリー名）を取り込みます。
        </p>
      </div>

      <ImportStartClient showOwnerOptions={ctx.role === "owner"} />
    </div>
  );
}

