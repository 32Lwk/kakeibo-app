"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UserMenu } from "@/components/UserMenu";

function clampMonthString(month: string | null): { year: number; monthIndex: number } {
  const now = new Date();
  if (!month) return { year: now.getFullYear(), monthIndex: now.getMonth() };
  if (!/^\d{4}-\d{2}$/.test(month)) return { year: now.getFullYear(), monthIndex: now.getMonth() };
  const [y, m] = month.split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  }
  return { year: y, monthIndex: m - 1 };
}

function formatMonthLabel(year: number, monthIndex: number) {
  return `${year}年${monthIndex + 1}月`;
}

function addMonths(year: number, monthIndex: number, delta: number) {
  const d = new Date(year, monthIndex + delta, 1);
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
}

function toMonthParam(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function Icon({
  name,
  className,
}: {
  name: "home" | "list" | "settings" | "calendar" | "chart" | "chevLeft" | "chevRight";
  className?: string;
}) {
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M3 10.8 12 3l9 7.8V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.8Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "list":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M7 7h14M7 12h14M7 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M3.5 7h.01M3.5 12h.01M3.5 17h.01" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M19.3 13.7a7.9 7.9 0 0 0 .05-1.7 7.9 7.9 0 0 0-.05-1.7l2.02-1.58-1.92-3.32-2.44.98a8.1 8.1 0 0 0-2.95-1.7L13.6 1h-3.2l-.4 2.68a8.1 8.1 0 0 0-2.95 1.7l-2.44-.98L2.69 7.72 4.7 9.3a7.9 7.9 0 0 0-.05 1.7c0 .58.02 1.15.05 1.7l-2.01 1.58 1.92 3.32 2.44-.98c.9.72 1.9 1.3 2.95 1.7l.4 2.68h3.2l.4-2.68c1.05-.4 2.05-.98 2.95-1.7l2.44.98 1.92-3.32-2.01-1.58Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
            opacity="0.85"
          />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M7 3v3M17 3v3M4.5 8.5h15"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M6 5.5h12a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "chart":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M5 19V5M5 19h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
          <path
            d="M8 16v-5M12 16V8M16 16v-3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "chevLeft":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M14.5 6 9 12l5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "chevRight":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M9.5 6 15 12l-5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function MonthControl({ basePath, variant }: { basePath: string; variant: "full" | "compact" }) {
  const searchParams = useSearchParams();
  const current = useMemo(() => clampMonthString(searchParams.get("month")), [searchParams]);
  const prev = addMonths(current.year, current.monthIndex, -1);
  const next = addMonths(current.year, current.monthIndex, 1);
  const prevHref = `${basePath}?month=${toMonthParam(prev.year, prev.monthIndex)}`;
  const nextHref = `${basePath}?month=${toMonthParam(next.year, next.monthIndex)}`;
  const thisHref = `${basePath}?month=${toMonthParam(current.year, current.monthIndex)}`;

  const compact = variant === "compact";

  return (
    <div
      className={[
        "flex items-center gap-1 rounded-xl border border-black/10 bg-white/70 backdrop-blur",
        compact ? "px-1.5 py-1.5" : "px-2 py-1.5",
      ].join(" ")}
    >
      <a
        aria-label="前の月"
        href={prevHref}
        className="grid size-8 place-items-center rounded-lg text-black/60 hover:bg-black/[0.05] hover:text-black"
      >
        <Icon name="chevLeft" className="size-5" />
      </a>
      <a
        aria-label="カレンダー（月を変更）"
        href={thisHref}
        className={[
          "flex items-center rounded-lg text-sm font-medium text-black/80 hover:bg-black/[0.05] hover:text-black",
          compact ? "px-2 py-1" : "gap-2 px-2 py-1",
        ].join(" ")}
      >
        <Icon name="calendar" className={compact ? "size-5" : "size-4"} />
        {compact ? null : <span className="tabular-nums">{formatMonthLabel(current.year, current.monthIndex)}</span>}
      </a>
      <a
        aria-label="次の月"
        href={nextHref}
        className="grid size-8 place-items-center rounded-lg text-black/60 hover:bg-black/[0.05] hover:text-black"
      >
        <Icon name="chevRight" className="size-5" />
      </a>
    </div>
  );
}

function TabLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: "home" | "list" | "settings" | "chart" | "calendar";
  label: string;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2",
        active ? "bg-black text-white" : "text-black/70 hover:bg-black/[0.06] hover:text-black",
      ].join(" ")}
    >
      <Icon name={icon} className="size-5" />
      <span className="text-[11px] font-medium">{label}</span>
    </a>
  );
}

function CalendarTab({
  basePath,
  month,
}: {
  basePath: string;
  month: { year: number; monthIndex: number };
}) {
  const router = useRouter();
  const value = toMonthParam(month.year, month.monthIndex);
  const label = formatMonthLabel(month.year, month.monthIndex).replace("年", "/").replace("月", "");

  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-2xl px-2 py-2 text-black/70 hover:bg-black/[0.06] hover:text-black">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1">
        <Icon name="calendar" className="size-5" />
        <span className="text-[11px] font-medium">カレンダー</span>
        <span className="text-[10px] font-medium text-black/45">{label}</span>
        <input
          aria-label="月を選択"
          type="month"
          className="sr-only"
          value={value}
          onChange={(e) => {
            const next = e.currentTarget.value;
            router.push(`${basePath}?month=${encodeURIComponent(next)}`);
          }}
        />
      </label>
    </div>
  );
}

export function AppChrome({
  email,
  theme,
  summaryOrder,
  children,
}: {
  email?: string | null;
  theme?: string | null;
  summaryOrder?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const t = theme ?? "system";
    if (t === "light" || t === "dark" || t === "system") {
      document.documentElement.dataset.theme = t;
    } else {
      document.documentElement.dataset.theme = "system";
    }
  }, [theme]);

  const monthParam = searchParams.get("month");
  const monthQuery = monthParam ? `?month=${encodeURIComponent(monthParam)}` : "";

  const isDashboard = pathname === "/dashboard";
  const isTransactions = pathname === "/transactions";
  const isNewTransaction = pathname === "/transactions/new";
  const isCalendar = pathname === "/calendar";
  const isSettings = pathname === "/settings";

  const currentMonth = useMemo(() => clampMonthString(searchParams.get("month")), [searchParams]);

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-zinc-50 text-black">
      <header className="hidden border-b border-black/10 bg-white/80 backdrop-blur md:block">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
          <a href="/dashboard" className="font-semibold tracking-tight text-black">
            家計簿
          </a>

          <nav className="flex items-center gap-1 text-sm">
            <a
              className={[
                "rounded-xl px-3 py-2 font-medium",
                isDashboard ? "bg-black text-white" : "text-black/70 hover:bg-black/[0.05] hover:text-black",
              ].join(" ")}
              href={`/dashboard${monthQuery}`}
            >
              ダッシュボード
            </a>
            <a
              className={[
                "rounded-xl px-3 py-2 font-medium",
                isTransactions ? "bg-black text-white" : "text-black/70 hover:bg-black/[0.05] hover:text-black",
              ].join(" ")}
              href={`/transactions${monthQuery}`}
            >
              明細
            </a>
            <a
              className={[
                "rounded-xl px-3 py-2 font-medium",
                isCalendar ? "bg-black text-white" : "text-black/70 hover:bg-black/[0.05] hover:text-black",
              ].join(" ")}
              href={`/calendar${monthQuery}`}
            >
              カレンダー
            </a>
            <a
              className={[
                "rounded-xl px-3 py-2 font-medium",
                isSettings ? "bg-black text-white" : "text-black/70 hover:bg-black/[0.05] hover:text-black",
              ].join(" ")}
              href="/settings"
            >
              設定
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <MonthControl basePath={isTransactions ? "/transactions" : isCalendar ? "/calendar" : "/dashboard"} variant="full" />
            <UserMenu email={email} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6 md:px-6 md:py-8 pb-24 md:pb-8">
        {children}
      </main>

      <nav className="md:hidden">
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/85 px-3 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            <TabLink href="/transactions/new" active={isNewTransaction} icon="list" label="追加" />
            <TabLink href={`/calendar${monthQuery}`} active={isCalendar} icon="calendar" label="カレンダー" />
            <TabLink href={`/dashboard${monthQuery}`} active={isDashboard} icon="chart" label="集計" />
            <TabLink href="/settings" active={isSettings} icon="settings" label="設定" />
          </div>
        </div>
      </nav>
    </div>
  );
}

