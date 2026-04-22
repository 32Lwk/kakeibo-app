import { prisma } from "@/lib/db";
import { requireAuthedContext, requireRole } from "@/lib/authz";
import Papa from "papaparse";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, string | undefined>;

function pick(row: AnyRow, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function parseYmdFlexible(s: string) {
  const raw = s.trim();
  if (!raw) return null;
  // YYYY/MM/DD or YYYY-MM-DD
  const m = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d);
}

function parseAmount(s: string) {
  const raw = s.replaceAll(",", "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.trunc(n);
}

export default async function MoneyForwardImportPage() {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "editor");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">マネーフォワードCSV取込（MVP）</h1>
        <p className="text-sm text-black/60">
          代表的な列名（例: 日付 / 金額（円） / 内容 / 大項目 / 中項目 / メモ）を自動で読み取って取り込みます。
        </p>
      </div>

      <form
        className="max-w-xl space-y-4 rounded-2xl border border-black/10 bg-white p-6"
        action={async (formData) => {
          "use server";
          const ctx = await requireAuthedContext();
          requireRole(ctx, "editor");

          const file = formData.get("file");
          if (!(file instanceof File)) throw new Error("ファイルを選択してください。");
          const createUnknownCategories = String(formData.get("createUnknownCategories") ?? "") === "on";
          const text = await file.text();

          const parsed = Papa.parse<AnyRow>(text, { header: true, skipEmptyLines: true });
          if (parsed.errors.length) throw new Error(`CSVの解析に失敗しました: ${parsed.errors[0]?.message ?? ""}`);

          const categories = await prisma.category.findMany({
            where: { householdId: ctx.householdId },
            select: { id: true, name: true },
          });
          const categoryByName = new Map(categories.map((c) => [c.name, c.id]));
          const uncategorizedId = categoryByName.get("未分類");
          if (!uncategorizedId) throw new Error("未分類カテゴリが見つかりません。");

          const unknownCategories = new Set<string>();
          let skippedDuplicates = 0;

          const txCreates = [];
          for (const row of parsed.data) {
            const dateStr = pick(row, ["日付", "取引日", "Date"]);
            const purchaseDate = parseYmdFlexible(dateStr);
            if (!purchaseDate) continue;

            const amountStr = pick(row, ["金額（円）", "金額", "Amount"]);
            const amountRaw = parseAmount(amountStr);
            if (!amountRaw) continue;

            const memoBase = pick(row, ["内容", "摘要", "メモ", "Memo"]);
            const memoExtra = pick(row, ["備考", "コメント"]);
            const memo = [memoBase, memoExtra].filter(Boolean).join(" / ") || undefined;

            const catName = pick(row, ["中項目", "大項目", "カテゴリ", "Category"]);
            let categoryId = categoryByName.get(catName);
            if (!categoryId) {
              if (catName) unknownCategories.add(catName);
              categoryId = uncategorizedId;
            }

            // MFは支出/収入で符号が付いていることが多い想定
            const type = amountRaw < 0 ? "expense" : "income";
            const totalAmount = Math.abs(amountRaw);

            const dup = await prisma.transaction.findFirst({
              where: {
                householdId: ctx.householdId,
                purchaseDate,
                totalAmount,
                type,
                memo: memo ?? null,
              },
              select: { id: true },
            });
            if (dup) {
              skippedDuplicates += 1;
              continue;
            }

            txCreates.push(
              prisma.transaction.create({
                data: {
                  householdId: ctx.householdId,
                  type,
                  purchaseDate,
                  totalAmount,
                  memo,
                  accountType: "cash",
                  splits: { create: [{ categoryId, amount: totalAmount }] },
                },
              }),
            );
          }

          const results = await prisma.$transaction(txCreates);

          if (createUnknownCategories && ctx.role === "owner" && unknownCategories.size) {
            const names = Array.from(unknownCategories).filter(Boolean).slice(0, 200);
            for (const name of names) {
              await prisma.category.upsert({
                where: { householdId_name: { householdId: ctx.householdId, name } },
                create: { householdId: ctx.householdId, name, sortOrder: 999, isDefault: false },
                update: {},
              });
            }
          }

          await prisma.import.create({
            data: {
              householdId: ctx.householdId,
              userId: ctx.userId,
              source: "moneyforward",
              fileName: file.name,
              summary: {
                createdCount: results.length,
                unknownCategories: Array.from(unknownCategories),
                skippedDuplicates,
                createUnknownCategories: createUnknownCategories && ctx.role === "owner",
              },
            },
          });

          await prisma.auditLog.create({
            data: {
              userId: ctx.userId,
              action: "import",
              entityType: "transactions",
              entityId: ctx.householdId,
              metadata: {
                source: "moneyforward",
                createdCount: results.length,
                unknownCategories: Array.from(unknownCategories),
                skippedDuplicates,
              },
            },
          });

          redirect(
            `/import/done?count=${results.length}&unknown=${encodeURIComponent(Array.from(unknownCategories).join(","))}&skipped=${skippedDuplicates}`,
          );
        }}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="file">
            CSVファイル
          </label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" required />
        </div>

        {ctx.role === "owner" ? (
          <label className="flex items-start gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-sm">
            <input type="checkbox" name="createUnknownCategories" className="mt-1 size-4 rounded border-black/20" />
            <div>
              <div className="font-medium">未知カテゴリを自動作成する（ownerのみ）</div>
              <div className="text-xs text-black/50">取り込み時に未知カテゴリを登録しておきます。</div>
            </div>
          </label>
        ) : null}

        <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90">取り込む</button>
      </form>
    </div>
  );
}

