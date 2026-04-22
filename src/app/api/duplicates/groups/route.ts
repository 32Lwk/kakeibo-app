import { prisma } from "@/lib/db";
import { requireAuthedContext, requireRole } from "@/lib/authz";
import { Prisma, TransactionType } from "@prisma/client";

/** Raw SQL / pg may return DATE as Date, string, or other — normalize to YYYY-MM-DD for filters. */
function normalizeGroupDay(dayRaw: unknown): string | null {
  if (dayRaw == null) return null;
  if (typeof dayRaw === "string") {
    const m = dayRaw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  if (dayRaw instanceof Date && !Number.isNaN(dayRaw.getTime())) {
    return `${dayRaw.getFullYear()}-${String(dayRaw.getMonth() + 1).padStart(2, "0")}-${String(dayRaw.getDate()).padStart(2, "0")}`;
  }
  const s = String(dayRaw);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function GET(req: Request) {
  try {
    const ctx = await requireAuthedContext();
    requireRole(ctx, "editor");

    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") ?? "amount").toLowerCase(); // amount | datetime | both
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = clampInt(url.searchParams.get("limit"), 30, 1, 100);

    const ignoreRows = await prisma.duplicateIgnore.findMany({
      where: { householdId: ctx.householdId },
      select: { kind: true, value: true },
    });
    const ignoreSet = new Set(ignoreRows.map((r) => `${r.kind}:${r.value}`));

    // Narrow candidates when q is provided (memo contains / amount exact / date exact).
    const whereBase: any = { householdId: ctx.householdId };
    if (q) {
      const amountMaybe = Number(q);
      const dateMaybe = /^\d{4}-\d{2}-\d{2}$/.test(q) ? new Date(q) : null;
      whereBase.OR = [
        { memo: { contains: q, mode: "insensitive" } },
        ...(Number.isFinite(amountMaybe) ? [{ totalAmount: Math.abs(Math.trunc(amountMaybe)) }] : []),
        ...(dateMaybe
          ? [
              {
                purchaseDate: {
                  gte: new Date(dateMaybe.getFullYear(), dateMaybe.getMonth(), dateMaybe.getDate()),
                  lt: new Date(dateMaybe.getFullYear(), dateMaybe.getMonth(), dateMaybe.getDate() + 1),
                },
              },
            ]
          : []),
      ];
    }

    if (mode === "datetime") {
      // Group by DAY (not exact timestamp) to avoid timezone confusion.
      const rows =
        q || whereBase.OR
          ? null
          : ((await prisma.$queryRaw(
              Prisma.sql`
                SELECT DATE("purchaseDate") AS "day", COUNT(*)::int AS "count"
                FROM "Transaction"
                WHERE "householdId" = ${ctx.householdId}
                GROUP BY DATE("purchaseDate")
                HAVING COUNT(*) > 1
                ORDER BY COUNT(*) DESC
                LIMIT ${limit}
              `,
            )) as Array<{ day: string; count: number }>);

      const out = [];
      const groups = rows ?? [];
      if (!rows) {
        const candidates = await prisma.transaction.findMany({
          where: whereBase,
          select: { purchaseDate: true },
          take: 5000,
        });
        const m = new Map<string, number>();
        for (const t of candidates) {
          const d = new Date(t.purchaseDate);
          const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          m.set(day, (m.get(day) ?? 0) + 1);
        }
        const arr = Array.from(m.entries())
          .filter(([, c]) => c > 1)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([day, count]) => ({ day, count }));
        groups.splice(0, groups.length, ...arr);
      }

      for (const g of groups) {
        const day = normalizeGroupDay((g as any).day);
        if (!day) continue;
        const ignoreKey = `datetime:${day}`;
        if (ignoreSet.has(ignoreKey)) continue;
        const [y, mo, d] = day.split("-").map((v) => Number(v));
        const start = new Date(y, mo - 1, d);
        const end = new Date(y, mo - 1, d + 1);
        const txs = await prisma.transaction.findMany({
          where: { householdId: ctx.householdId, purchaseDate: { gte: start, lt: end } },
          orderBy: { createdAt: "asc" },
          take: 30,
          select: { id: true, purchaseDate: true, createdAt: true, type: true, totalAmount: true, memo: true },
        });
        out.push({ key: day, label: `日時: ${day}`, ignoreKey, count: (g as any).count ?? txs.length, txs });
      }
      return Response.json({ mode, q, groups: out });
    }

    if (mode === "both") {
      // "both" means: same DAY + same signed amount (type+totalAmount) + same memo (to avoid mixing different memos)
      const rows =
        q || whereBase.OR
          ? null
          : ((await prisma.$queryRaw(
              Prisma.sql`
                SELECT
                  DATE("purchaseDate") AS "day",
                  "type" AS "type",
                  "totalAmount" AS "totalAmount",
                  COALESCE("memo", '') AS "memo",
                  COUNT(*)::int AS "count"
                FROM "Transaction"
                WHERE "householdId" = ${ctx.householdId}
                GROUP BY DATE("purchaseDate"), "type", "totalAmount", COALESCE("memo", '')
                HAVING COUNT(*) > 1
                ORDER BY COUNT(*) DESC
                LIMIT ${limit}
              `,
            )) as Array<{ day: string; type: string; totalAmount: number; memo: string; count: number }>);

      const groups = rows ?? [];
      if (!rows) {
        const candidates = await prisma.transaction.findMany({
          where: whereBase,
          select: { purchaseDate: true, type: true, totalAmount: true, memo: true },
          take: 5000,
        });
        const m = new Map<string, { day: string; type: string; totalAmount: number; memo: string; count: number }>();
        for (const t of candidates) {
          const d = new Date(t.purchaseDate);
          const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const memo = t.memo ?? "";
          const key = `${day}|${t.type}|${t.totalAmount}|${memo}`;
          const cur = m.get(key);
          if (cur) cur.count += 1;
          else m.set(key, { day, type: t.type, totalAmount: t.totalAmount, memo, count: 1 });
        }
        const arr = Array.from(m.values()).filter((x) => x.count > 1);
        arr.sort((a, b) => b.count - a.count);
        groups.splice(0, groups.length, ...arr.slice(0, limit));
      }

      const out = [];
      for (const g of groups) {
        const day = normalizeGroupDay((g as any).day);
        if (!day) continue;
        const typeRaw = String((g as any).type);
        if (typeRaw !== TransactionType.expense && typeRaw !== TransactionType.income) continue;
        const type: TransactionType = typeRaw as TransactionType;
        const amt = Math.trunc(Number((g as any).totalAmount));
        if (!Number.isFinite(amt)) continue;
        const memoNorm = String((g as any).memo ?? "");
        const ignoreKey = `datetime:${day}|${type}|${amt}|${memoNorm}`;
        if (ignoreSet.has(ignoreKey)) continue;
        // Use same DATE(...) predicate as GROUP BY so timezone / Date-boundary bugs cannot desync rows.
        const txs = (await prisma.$queryRaw(
          Prisma.sql`
            SELECT id, "purchaseDate", "createdAt", "type", "totalAmount", "memo"
            FROM "Transaction"
            WHERE "householdId" = ${ctx.householdId}
              AND DATE("purchaseDate") = CAST(${day} AS date)
              AND "type"::text = ${type}
              AND "totalAmount" = ${amt}
              AND COALESCE("memo", '') = ${memoNorm}
            ORDER BY "createdAt" ASC
            LIMIT 30
          `,
        )) as Array<{
          id: string;
          purchaseDate: Date;
          createdAt: Date;
          type: TransactionType;
          totalAmount: number;
          memo: string | null;
        }>;
        if (txs.length < 2) continue;
        const signedPrefix = type === "expense" ? "-" : "+";
        const label = `金額+日時: ${day} ${signedPrefix}¥${amt}${memoNorm ? ` / ${memoNorm}` : ""}`;
        out.push({
          key: `${day}|${type}|${amt}|${memoNorm}`,
          label,
          ignoreKey,
          count: (g as any).count ?? txs.length,
          txs,
        });
      }
      return Response.json({ mode, q, groups: out });
    }

    // amount (default)
    // amount duplicates must consider sign/type
    const rows =
      q || whereBase.OR
        ? null
        : ((await prisma.$queryRaw(
            Prisma.sql`
              SELECT "type", "totalAmount", COUNT(*)::int AS "count"
              FROM "Transaction"
              WHERE "householdId" = ${ctx.householdId}
              GROUP BY "type", "totalAmount"
              HAVING COUNT(*) > 1
              ORDER BY COUNT(*) DESC
              LIMIT ${limit}
            `,
          )) as Array<{ type: string; totalAmount: number; count: number }>);

    const groups: Array<{ type: string; totalAmount: number; count: number }> = rows ?? [];
    if (!rows) {
      const candidates = await prisma.transaction.findMany({
        where: whereBase,
        select: { type: true, totalAmount: true },
        take: 5000,
      });
      const m = new Map<string, { type: string; totalAmount: number; count: number }>();
      for (const t of candidates) {
        const key = `${t.type}|${t.totalAmount}`;
        const cur = m.get(key);
        if (cur) cur.count += 1;
        else m.set(key, { type: t.type, totalAmount: t.totalAmount, count: 1 });
      }
      const arr = Array.from(m.values()).filter((x) => x.count > 1);
      arr.sort((a, b) => b.count - a.count);
      groups.splice(0, groups.length, ...arr.slice(0, limit));
    }

    const out = [];
    for (const g of groups) {
      const amt = Number((g as any).totalAmount);
      const typeRaw = String((g as any).type);
      if (typeRaw !== TransactionType.expense && typeRaw !== TransactionType.income) continue;
      const type: TransactionType = typeRaw as TransactionType;
      const ignoreKey = `amount:${type}|${amt}`;
      if (ignoreSet.has(ignoreKey)) continue;
      const txs = await prisma.transaction.findMany({
        where: { householdId: ctx.householdId, totalAmount: amt, type },
        orderBy: { purchaseDate: "asc" },
        take: 30,
        select: { id: true, purchaseDate: true, createdAt: true, type: true, totalAmount: true, memo: true },
      });
      const signedPrefix = type === "expense" ? "-" : "+";
      out.push({ key: `${type}|${amt}`, label: `金額: ${signedPrefix}¥${amt}`, ignoreKey, count: (g as any).count ?? txs.length, txs });
    }
    return Response.json({ mode: "amount", q, groups: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

