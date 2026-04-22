"use client";

import { useEffect, useState } from "react";

const ACCENTS = [
  { value: "zinc", label: "モノクロ" },
  { value: "indigo", label: "インディゴ" },
  { value: "emerald", label: "エメラルド" },
  { value: "orange", label: "オレンジ" },
  { value: "rose", label: "ローズ" },
];

export function ThemeAccentSelect({
  theme,
  accent,
}: {
  theme: string;
  accent: string | null;
}) {
  const [t, setT] = useState(theme || "system");
  const [a, setA] = useState(accent || "zinc");

  useEffect(() => {
    if (t === "light" || t === "dark" || t === "system") {
      document.documentElement.dataset.theme = t;
    }
  }, [t]);

  useEffect(() => {
    document.documentElement.dataset.accent = a;
  }, [a]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="theme">
          画面テーマ
        </label>
        <select
          id="theme"
          name="theme"
          value={t}
          onChange={(e) => setT(e.currentTarget.value)}
          className="w-full rounded-xl border border-black/15 bg-white px-3 py-2"
        >
          <option value="system">端末に合わせる</option>
          <option value="light">ライト</option>
          <option value="dark">ダーク</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="accent">
          アクセントカラー
        </label>
        <select
          id="accent"
          name="accent"
          value={a}
          onChange={(e) => setA(e.currentTarget.value)}
          className="w-full rounded-xl border border-black/15 bg-white px-3 py-2"
        >
          {ACCENTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-black/50">選択内容は「保存」で反映されます（この画面ではプレビューのみ即時）。</div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-black/50">プレビュー</div>
            <div
              className="h-4 w-8 rounded-full border border-black/15"
              style={{ backgroundColor: "var(--accent)" }}
              aria-label="アクセントカラープレビュー"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

