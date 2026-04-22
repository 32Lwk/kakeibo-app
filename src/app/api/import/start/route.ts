import { prisma } from "@/lib/db";
import { requireAuthedContext, requireRole } from "@/lib/authz";
import Papa from "papaparse";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type AmountsRow = {
  金額?: string;
  日付?: string;
  メモ?: string;
  カテゴリー名?: string;
};

type ImportProgressSummary = {
  status: "queued" | "running" | "done" | "error";
  phase?: "parsing" | "dedupe" | "writing" | "finalizing";
  processed?: number;
  total?: number;
  totalRows?: number; // CSV rows (excluding header)
  totalValidRows?: number; // rows with valid amount/date
  totalNewRows?: number; // rows that will be created after dedupe
  createdCount?: number;
  skippedDuplicates?: number;
  skippedInvalid?: number;
  invalidSamples?: Array<{
    line: number; // 1-based line number in the original CSV (including header)
    amount?: string;
    date?: string;
    memo?: string;
    category?: string;
    reason: "amount_invalid" | "amount_zero" | "date_missing" | "date_invalid";
  }>;
  unknownCategories?: string[];
  month?: string;
  fileName?: string;
  error?: string;
};

async function runImportJob({
  importId,
  tmpPath,
  fileName,
  createUnknownCategories,
}: {
  importId: string;
  tmpPath: string;
  fileName: string;
  createUnknownCategories: boolean;
}) {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "editor");

  const update = async (summary: ImportProgressSummary) => {
    await prisma.import.update({
      where: { id: importId },
      data: { summary },
    });
  };

  try {
    await update({ status: "running", phase: "parsing", processed: 0, total: 0, fileName });

    const text = await fs.readFile(tmpPath, "utf8");
    const parsed = Papa.parse<AmountsRow>(text, { header: true, skipEmptyLines: true });
    if (parsed.errors.length) {
      throw new Error(`CSVの解析に失敗しました: ${parsed.errors[0]?.message ?? ""}`);
    }
    const totalRows = parsed.data.length;

    const categories = await prisma.category.findMany({
      where: { householdId: ctx.householdId },
      select: { id: true, name: true },
    });
    const categoryByName = new Map<string, string>(categories.map((c) => [c.name, c.id]));
    const uncategorizedId = categoryByName.get("未分類");
    if (!uncategorizedId) throw new Error("未分類カテゴリが見つかりません。");

    const unknownCategories = new Set<string>();
    let skippedDuplicates = 0;
    let skippedInvalid = 0;
    const invalidSamples: NonNullable<ImportProgressSummary["invalidSamples"]> = [];
    let createdCount = 0;
    let latestPurchaseDate: Date | null = null;
    let minPurchaseDate: Date | null = null;
    let maxPurchaseDate: Date | null = null;

    const normalizeKey = (d: Date, totalAmount: number, type: string, memo: string | null) => {
      const yyyyMmDd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return `${yyyyMmDd}\t${type}\t${totalAmount}\t${memo ?? ""}`;
    };

    const rows: Array<{
      purchaseDate: Date;
      memo: string | undefined;
      categoryId: string;
      type: "expense" | "income";
      totalAmount: number;
      key: string;
    }> = [];

    for (let i = 0; i < parsed.data.length; i += 1) {
      const row = parsed.data[i];
      const line = i + 2; // header=1, first data row=2
      const amountStr = String(row.金額 ?? "").trim();
      const dateStr = String(row.日付 ?? "").trim();
      const memoStr = String(row.メモ ?? "").trim();
      const catStr = String(row.カテゴリー名 ?? "").trim();

      const amountRaw = Number(amountStr);
      if (!Number.isFinite(amountRaw)) {
        skippedInvalid += 1;
        if (invalidSamples.length < 50) {
          invalidSamples.push({ line, amount: amountStr, date: dateStr, memo: memoStr, category: catStr, reason: "amount_invalid" });
        }
        continue;
      }
      if (amountRaw === 0) {
        skippedInvalid += 1;
        if (invalidSamples.length < 50) {
          invalidSamples.push({ line, amount: amountStr, date: dateStr, memo: memoStr, category: catStr, reason: "amount_zero" });
        }
        continue;
      }

      if (!dateStr) {
        skippedInvalid += 1;
        if (invalidSamples.length < 50) {
          invalidSamples.push({ line, amount: amountStr, date: dateStr, memo: memoStr, category: catStr, reason: "date_missing" });
        }
        continue;
      }
      const [y, m, d] = dateStr.split("/").map((s) => Number(s));
      if (!y || !m || !d) {
        skippedInvalid += 1;
        if (invalidSamples.length < 50) {
          invalidSamples.push({ line, amount: amountStr, date: dateStr, memo: memoStr, category: catStr, reason: "date_invalid" });
        }
        continue;
      }
      const purchaseDate = new Date(y, m - 1, d);
      if (!latestPurchaseDate || purchaseDate > latestPurchaseDate) latestPurchaseDate = purchaseDate;
      if (!minPurchaseDate || purchaseDate < minPurchaseDate) minPurchaseDate = purchaseDate;
      if (!maxPurchaseDate || purchaseDate > maxPurchaseDate) maxPurchaseDate = purchaseDate;

      const memo = memoStr || undefined;
      const categoryName = catStr;
      let categoryId = categoryByName.get(categoryName);
      if (!categoryId) {
        if (categoryName) unknownCategories.add(categoryName);
        categoryId = uncategorizedId;
      }

      const type = amountRaw < 0 ? "expense" : "income";
      const totalAmount = Math.abs(Math.trunc(amountRaw));
      const key = normalizeKey(purchaseDate, totalAmount, type, memo ?? null);
      rows.push({ purchaseDate, memo, categoryId, type, totalAmount, key });
    }

    await update({
      status: "running",
      phase: "dedupe",
      processed: 0,
      total: totalRows,
      totalRows,
      totalValidRows: rows.length,
      skippedInvalid,
      invalidSamples,
      fileName,
    });

    const existingKeySet = new Set<string>();
    if (minPurchaseDate && maxPurchaseDate) {
      const start = new Date(minPurchaseDate.getFullYear(), minPurchaseDate.getMonth(), minPurchaseDate.getDate());
      const end = new Date(maxPurchaseDate.getFullYear(), maxPurchaseDate.getMonth(), maxPurchaseDate.getDate() + 1);
      const existing = await prisma.transaction.findMany({
        where: { householdId: ctx.householdId, purchaseDate: { gte: start, lt: end } },
        select: { purchaseDate: true, totalAmount: true, type: true, memo: true },
      });
      for (const t of existing) {
        existingKeySet.add(normalizeKey(t.purchaseDate, t.totalAmount, t.type, t.memo));
      }
    }

    const creates: Array<{
      householdId: string;
      type: "expense" | "income";
      purchaseDate: Date;
      totalAmount: number;
      memo: string | undefined;
      accountType: "cash";
      categoryId: string;
    }> = [];

    for (const r of rows) {
      if (existingKeySet.has(r.key)) {
        skippedDuplicates += 1;
        continue;
      }
      existingKeySet.add(r.key);
      creates.push({
        householdId: ctx.householdId,
        type: r.type,
        purchaseDate: r.purchaseDate,
        totalAmount: r.totalAmount,
        memo: r.memo,
        accountType: "cash",
        categoryId: r.categoryId,
      });
    }

    await update({
      status: "running",
      phase: "writing",
      processed: 0,
      total: creates.length,
      totalRows,
      totalValidRows: rows.length,
      totalNewRows: creates.length,
      skippedInvalid,
      skippedDuplicates,
      invalidSamples,
      fileName,
    });

    const chunkSize = 50;
    let processed = 0;
    for (let i = 0; i < creates.length; i += chunkSize) {
      const chunk = creates.slice(i, i + chunkSize);
      for (const c of chunk) {
        await prisma.transaction.create({
          data: {
            householdId: c.householdId,
            type: c.type,
            purchaseDate: c.purchaseDate,
            totalAmount: c.totalAmount,
            memo: c.memo,
            accountType: c.accountType,
            splits: { create: [{ categoryId: c.categoryId, amount: c.totalAmount }] },
          },
        });
        createdCount += 1;
        processed += 1;
      }
      await update({ status: "running", phase: "writing", processed, total: creates.length, fileName });
    }

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

    const month =
      latestPurchaseDate ? `${latestPurchaseDate.getFullYear()}-${String(latestPurchaseDate.getMonth() + 1).padStart(2, "0")}` : "";

    await update({
      status: "done",
      phase: "finalizing",
      processed: creates.length,
      total: creates.length,
      totalRows,
      totalValidRows: rows.length,
      totalNewRows: creates.length,
      createdCount,
      skippedDuplicates,
      skippedInvalid,
      invalidSamples,
      unknownCategories: Array.from(unknownCategories),
      month: month || undefined,
      fileName,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.import.update({
      where: { id: importId },
      data: { summary: { status: "error", error: msg, fileName } satisfies ImportProgressSummary },
    });
  } finally {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore
    }
  }
}

export async function POST(req: Request) {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "editor");

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "ファイルを選択してください。" }, { status: 400 });
  }
  const createUnknownCategories = String(formData.get("createUnknownCategories") ?? "") === "on";

  const importRow = await prisma.import.create({
    data: {
      householdId: ctx.householdId,
      userId: ctx.userId,
      source: "amounts.csv",
      fileName: file.name,
      summary: { status: "queued", processed: 0, total: 0, fileName: file.name } satisfies ImportProgressSummary,
    },
    select: { id: true },
  });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kakeibo-import-"));
  const tmpPath = path.join(tmpDir, `${importRow.id}.csv`);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(tmpPath, buf);

  // fire-and-forget (dev / single process): progress is stored in DB.
  void runImportJob({ importId: importRow.id, tmpPath, fileName: file.name, createUnknownCategories });

  return Response.json({ importId: importRow.id });
}

