"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { DrumPickerDialog, DrumYearMonthDialog } from "@/components/DrumPicker";

type PieDatum = { categoryId: string; categoryName: string; value: number };
type BarDatum = { month: string; value: number };
type TxDatum = { id: string; purchaseDate: string; memo: string | null; totalAmount: number; type: "expense" | "income" };

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

const COLORS = ["#111827", "#2563eb", "#16a34a", "#f97316", "#a855f7", "#0ea5e9", "#ef4444", "#6b7280", "#14b8a6", "#eab308"];

function addMonths(monthParam: string, delta: number) {
  const m = monthParam.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const y = m ? Number(m[1]) : now.getFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getMonth();
  const d = new Date(y, mo + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function DashboardCharts({
  view,
  monthParam,
  year,
  months,
  years,
  monthExpense,
  monthIncome,
  yearExpense,
  yearIncome,
  selectedCategoryId,
  selectedCategoryName,
  series,
  categoryTxs,
}: {
  view: "month_expense" | "month_income" | "year_expense" | "year_income";
  monthParam: string; // YYYY-MM
  year: number;
  months: string[];
  years: number[];
  monthExpense: PieDatum[];
  monthIncome: PieDatum[];
  yearExpense: PieDatum[];
  yearIncome: PieDatum[];
  selectedCategoryId: string | null;
  selectedCategoryName: string | null;
  series: BarDatum[];
  categoryTxs: TxDatum[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const kind = view.endsWith("income") ? ("income" as const) : ("expense" as const);
  const isYearView = view.startsWith("year_");

  function push(next: Record<string, string | null | undefined>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === undefined || v === "") p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    const url = qs ? `/dashboard?${qs}` : "/dashboard";
    startTransition(() => {
      router.push(url);
      // searchParams の変更が描画に反映されないケースを避けるため明示的に再取得する
      router.refresh();
    });
  }

  const pies = useMemo(() => {
    const src = !isYearView ? (kind === "expense" ? monthExpense : monthIncome) : kind === "expense" ? yearExpense : yearIncome;
    return src.filter((d) => d.value > 0);
  }, [isYearView, kind, monthExpense, monthIncome, yearExpense, yearIncome]);

  const monthIndex = Math.max(0, months.indexOf(monthParam));
  const yearIndex = Math.max(0, years.indexOf(year));
  const total = pies.reduce((a, d) => a + d.value, 0);

  const groupedTxs = useMemo(() => {
    const groups: { date: string; rows: TxDatum[] }[] = [];
    const map = new Map<string, TxDatum[]>();
    for (const t of categoryTxs) {
      const key = t.purchaseDate.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1));
    for (const k of keys) {
      groups.push({ date: k, rows: map.get(k)! });
    }
    return groups;
  }, [categoryTxs]);

  return (
    <div className="flex min-h-[60dvh] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="grid w-full grid-cols-4 rounded-xl border border-black/10 bg-white p-1 text-sm">
            {(
              [
                { v: "month_expense", label: "月/支出" },
                { v: "month_income", label: "月/収入" },
                { v: "year_expense", label: "年/支出" },
                { v: "year_income", label: "年/収入" },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => push({ view: t.v, categoryId: null, categoryName: null })}
                className={[
                  "rounded-lg px-3 py-2 font-medium",
                  view === t.v ? "bg-black text-white" : "text-black/70 hover:bg-black/[0.03] hover:text-black",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            aria-label={isYearView ? "前の年" : "前の月"}
            onClick={() => {
              if (isYearView) push({ year: String(year - 1) });
              else push({ month: addMonths(monthParam, -1) });
            }}
            className="relative z-10 grid size-10 place-items-center rounded-xl border border-black/10 bg-white hover:bg-black/[0.03]"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-5 text-black/70" aria-hidden="true">
              <path d="M14.5 6 9 12l5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {isYearView ? (
            <DrumPickerDialog
              title="年を選択"
              ariaLabel="年を選択"
              triggerLabel={`${year}年`}
              value={String(year)}
              options={years.map((y) => ({ value: String(y), label: `${y}年` }))}
              onSelect={(yy) => push({ year: yy })}
            />
          ) : (
            <DrumYearMonthDialog
              title="年月を選択"
              value={monthParam}
              triggerLabel={`${monthParam.slice(0, 4)}年${monthParam.slice(5)}月`}
              onSelect={(ym) => push({ month: ym })}
            />
          )}

          <button
            type="button"
            aria-label={isYearView ? "次の年" : "次の月"}
            onClick={() => {
              if (isYearView) push({ year: String(year + 1) });
              else push({ month: addMonths(monthParam, 1) });
            }}
            className="relative z-10 grid size-10 place-items-center rounded-xl border border-black/10 bg-white hover:bg-black/[0.03]"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-5 text-black/70" aria-hidden="true">
              <path d="M9.5 6 15 12l-5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid flex-1 gap-4 md:grid-cols-2 md:items-stretch">
        <div className="flex flex-col rounded-2xl border border-black/10 bg-white p-4">
          <div className="h-64 md:flex-1">
            {selectedCategoryId ? (
              series.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-black/60">表示するデータがありません。</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `${Math.trunc(v / 1000)}k`} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: any) => `¥${yen(Number(v) || 0)}`} />
                    <Bar
                      dataKey="value"
                      fill="#111827"
                      radius={[8, 8, 0, 0]}
                      onClick={(d: any) => {
                        const m = String(d?.month ?? "");
                        if (!m) return;
                        push({ month: m });
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )
            ) : pies.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-black/60">データがありません。</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(v: any) => `¥${yen(Number(v) || 0)}`} />
                  <Pie
                    data={pies}
                    dataKey="value"
                    nameKey="categoryName"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    onClick={(d: any) => {
                      const cid = String(d?.payload?.categoryId ?? "");
                      const cname = String(d?.payload?.categoryName ?? "");
                      if (cid) push({ categoryId: cid, categoryName: cname });
                    }}
                  >
                    {pies.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <div className="text-black/60">合計</div>
            <div className="font-semibold tabular-nums">¥{yen(total)}</div>
          </div>
          {selectedCategoryId ? (
            <div className="mt-2 text-xs text-black/50">
              {selectedCategoryName ?? "選択カテゴリ"} の推移（棒を押すと月を移動）
            </div>
          ) : null}
        </div>

        <div className="flex flex-col rounded-2xl border border-black/10 bg-white p-4">
          {selectedCategoryId ? (
            <div className="flex flex-1 flex-col">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{selectedCategoryName ?? "カテゴリ"}（明細）</div>
                  <div className="text-xs text-black/50">表示中: {monthParam}</div>
                </div>
                <a
                  className="text-sm underline"
                  href={`/transactions?month=${encodeURIComponent(monthParam)}&q=${encodeURIComponent(selectedCategoryName ?? "")}`}
                >
                  明細で開く
                </a>
              </div>

              {groupedTxs.length === 0 ? (
                <div className="mt-3 flex-1 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-sm text-black/60">
                  明細がありません。
                </div>
              ) : (
                <div className="mt-3 flex-1 overflow-auto rounded-xl border border-black/10">
                  {groupedTxs.map((g) => (
                    <div key={g.date}>
                      <div className="bg-black/[0.02] px-4 py-2 text-xs font-medium text-black/60">{g.date}</div>
                      <div className="divide-y divide-black/10 bg-white">
                        {g.rows.map((t) => (
                          <a key={t.id} href={`/transactions/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-black/[0.03]">
                            <div className="flex-1 text-sm">{t.memo ?? "（メモなし）"}</div>
                            <div className="text-sm font-medium tabular-nums">
                              {t.type === "expense" ? "-" : "+"}¥{yen(t.totalAmount)}
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3">
                <button
                  type="button"
                  className="w-full rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
                  onClick={() => push({ categoryId: null, categoryName: null })}
                >
                  カテゴリ選択に戻る
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="text-sm font-medium">カテゴリ別合計</div>
              <div className="mt-3 flex-1 divide-y divide-black/10">
                {pies.length === 0 ? (
                  <div className="grid h-full place-items-center py-10 text-sm text-black/60">データがありません。</div>
                ) : (
                  pies.slice(0, 10).map((d) => (
                    <button
                      type="button"
                      key={d.categoryId}
                      onClick={() => push({ categoryId: d.categoryId, categoryName: d.categoryName })}
                      className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-black/[0.02]"
                    >
                      <div className="text-sm text-black/80">{d.categoryName}</div>
                      <div className="text-sm font-medium tabular-nums">¥{yen(d.value)}</div>
                    </button>
                  ))
                )}
              </div>
              <div className="mt-2 text-xs text-black/50">カテゴリを選ぶと、左が推移（棒）に切り替わり、右に明細が表示されます。</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

