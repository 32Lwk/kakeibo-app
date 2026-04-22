"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DrumYearMonthDialog } from "@/components/DrumPicker";

function clampMonthString(month: string | null): { year: number; monthIndex: number } {
  const now = new Date();
  if (!month) return { year: now.getFullYear(), monthIndex: now.getMonth() };
  if (!/^\d{4}-\d{2}$/.test(month)) return { year: now.getFullYear(), monthIndex: now.getMonth() };
  const [y, m] = month.split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return { year: now.getFullYear(), monthIndex: now.getMonth() };
  return { year: y, monthIndex: m - 1 };
}

function toMonthParam(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function addMonths(year: number, monthIndex: number, delta: number) {
  const d = new Date(year, monthIndex + delta, 1);
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
}

function Icon({ name, className }: { name: "chevLeft" | "chevRight" | "search"; className?: string }) {
  if (name === "search") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "chevLeft") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path d="M14.5 6 9 12l5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M9.5 6 15 12l-5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CalendarHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = useMemo(() => clampMonthString(searchParams.get("month")), [searchParams]);
  const monthValue = toMonthParam(current.year, current.monthIndex);
  const label = `${current.year}年${current.monthIndex + 1}月`;
  const currentQ = (searchParams.get("q") ?? "").trim();
  const [searchOpen, setSearchOpen] = useState(Boolean(currentQ));
  const [q, setQ] = useState(currentQ);

  const prev = addMonths(current.year, current.monthIndex, -1);
  const next = addMonths(current.year, current.monthIndex, 1);

  const baseParams = new URLSearchParams(searchParams.toString());
  baseParams.delete("day"); // month jump clears selected day

  function hrefFor(y: number, mi: number) {
    const p = new URLSearchParams(baseParams);
    p.set("month", toMonthParam(y, mi));
    return `${pathname}?${p.toString()}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <a
            aria-label="前の月"
            href={hrefFor(prev.year, prev.monthIndex)}
            className="grid size-10 place-items-center rounded-xl border border-black/10 bg-white hover:bg-black/[0.03]"
          >
            <Icon name="chevLeft" className="size-5 text-black/70" />
          </a>

          <div className="flex flex-1">
            <DrumYearMonthDialog
              title="年月を選択"
              value={monthValue}
              triggerLabel={label}
              onSelect={(m) => router.push(hrefFor(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1))}
            />
          </div>

          <a
            aria-label="次の月"
            href={hrefFor(next.year, next.monthIndex)}
            className="grid size-10 place-items-center rounded-xl border border-black/10 bg-white hover:bg-black/[0.03]"
          >
            <Icon name="chevRight" className="size-5 text-black/70" />
          </a>
        </div>

        <button
          type="button"
          aria-label="明細を検索"
          onClick={() => setSearchOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-black/80 hover:bg-black/[0.03]"
        >
          <Icon name="search" className="size-5 text-black/70" />
          検索
        </button>
      </div>

      {searchOpen ? (
        <form
          className="rounded-2xl border border-black/10 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const p = new URLSearchParams(searchParams.toString());
            p.delete("day");
            p.set("month", monthValue);
            const nextQ = q.trim();
            if (nextQ) p.set("q", nextQ);
            else p.delete("q");
            router.push(`${pathname}?${p.toString()}`);
          }}
        >
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="q">
                検索（店名/メモ/カテゴリ/金額）
              </label>
              <input
                id="q"
                name="q"
                value={q}
                onChange={(e) => setQ(e.currentTarget.value)}
                placeholder="例: スーパー / 食費 / 1200"
                className="w-full rounded-xl border border-black/15 px-3 py-2"
              />
            </div>
            <div className="flex items-end gap-2">
              <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90">適用</button>
              <button
                type="button"
                className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
                onClick={() => {
                  setQ("");
                  const p = new URLSearchParams(searchParams.toString());
                  p.delete("q");
                  p.delete("day");
                  p.set("month", monthValue);
                  router.push(`${pathname}?${p.toString()}`);
                }}
              >
                クリア
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

