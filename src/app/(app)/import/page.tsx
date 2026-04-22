import { prisma } from "@/lib/db";
import Papa from "papaparse";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type AmountsRow = {
  金額?: string;
  日付?: string;
  メモ?: string;
  カテゴリー名?: string;
};

export default async function ImportPage() {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId },
    select: { householdId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">CSV取込</h1>
        <p className="text-sm text-black/60">
          まずは `amounts.csv` 互換（列: 金額,日付,メモ,カテゴリー名）を取り込みます。
        </p>
      </div>

      <form
        className="max-w-xl space-y-4 rounded-2xl border border-black/10 bg-white p-6"
        action={async (formData) => {
          "use server";
          const file = formData.get("file");
          if (!(file instanceof File)) throw new Error("ファイルを選択してください。");
          const text = await file.text();

          const parsed = Papa.parse<AmountsRow>(text, {
            header: true,
            skipEmptyLines: true,
          });
          if (parsed.errors.length) {
            throw new Error(`CSVの解析に失敗しました: ${parsed.errors[0]?.message ?? ""}`);
          }

          const categories = await prisma.category.findMany({
            where: { householdId: membership.householdId },
            select: { id: true, name: true },
          });
          const categoryByName = new Map(categories.map((c) => [c.name, c.id]));

          const uncategorizedId = categoryByName.get("未分類");
          if (!uncategorizedId) throw new Error("未分類カテゴリが見つかりません。");

          const unknownCategories = new Set<string>();
          let createdCount = 0;

          const txCreates = [];
          for (const row of parsed.data) {
            const amountRaw = Number(row.金額 ?? "");
            if (!Number.isFinite(amountRaw) || amountRaw === 0) continue;

            const dateStr = String(row.日付 ?? "").trim();
            if (!dateStr) continue;
            // YYYY/MM/DD
            const [y, m, d] = dateStr.split("/").map((s) => Number(s));
            if (!y || !m || !d) continue;
            const purchaseDate = new Date(y, m - 1, d);

            const memo = String(row.メモ ?? "").trim() || undefined;
            const categoryName = String(row.カテゴリー名 ?? "").trim();
            let categoryId = categoryByName.get(categoryName);
            if (!categoryId) {
              if (categoryName) unknownCategories.add(categoryName);
              categoryId = uncategorizedId;
            }

            const type = amountRaw < 0 ? "expense" : "income";
            const totalAmount = Math.abs(Math.trunc(amountRaw));

            txCreates.push(
              prisma.transaction.create({
                data: {
                  householdId: membership.householdId,
                  type,
                  purchaseDate,
                  totalAmount,
                  memo,
                  accountType: "cash",
                  splits: {
                    create: [{ categoryId, amount: totalAmount }],
                  },
                },
              }),
            );
          }

          const results = await prisma.$transaction(txCreates);
          createdCount = results.length;

          await prisma.import.create({
            data: {
              householdId: membership.householdId,
              userId,
              source: "amounts.csv",
              fileName: file.name,
              summary: {
                createdCount,
                unknownCategories: Array.from(unknownCategories),
                role: membership.role,
              },
            },
          });

          await prisma.auditLog.create({
            data: {
              userId,
              action: "import",
              entityType: "transactions",
              entityId: membership.householdId,
              metadata: { createdCount, unknownCategories: Array.from(unknownCategories) },
            },
          });

          redirect(`/import/done?count=${createdCount}&unknown=${encodeURIComponent(Array.from(unknownCategories).join(","))}`);
        }}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="file">
            CSVファイル
          </label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" required />
          <div className="text-xs text-black/50">
            未知カテゴリは一旦「未分類」に寄せます（後で一括マッピングできます）。
            カテゴリ新規作成は owner のみ許可予定です。
          </div>
        </div>
        <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90">
          取り込む
        </button>
      </form>
    </div>
  );
}

