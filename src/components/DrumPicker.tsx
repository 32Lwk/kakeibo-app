"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type Option = { value: string; label: string };

const ITEM_H = 40; // 各行の高さ
const VISIBLE_ROWS = 5; // 表示行数（中央 + 上下 2 行）
const WHEEL_H = ITEM_H * VISIBLE_ROWS; // 200px
const PAD_Y = (WHEEL_H - ITEM_H) / 2; // 中央に寄せるための上下パディング

function clampIndex(n: number, len: number) {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(len - 1, n));
}

type OverlayNumericInput = {
  ariaLabel: string;
  helperText?: string;
  maxLength?: number;
  formatValue?: (value: string) => string;
  sanitizeDraft?: (text: string) => string;
  commitDraft: (draft: string) => string | null;
};

function buildNumericOverlayInput(
  options: Option[],
  {
    ariaLabel,
    helperText,
  }: {
    ariaLabel: string;
    helperText?: string;
  },
): OverlayNumericInput | undefined {
  if (options.length === 0) return undefined;
  if (options.some((o) => !/^\d+$/.test(o.value))) return undefined;

  const allowedValues = new Set(options.map((o) => o.value));
  const maxLength = Math.max(...options.map((o) => o.value.length));
  const hasFixedWidth = new Set(options.map((o) => o.value.length)).size === 1;
  const usesZeroPadding = hasFixedWidth && options.some((o) => o.value !== String(Number(o.value)));

  return {
    ariaLabel,
    helperText,
    maxLength,
    formatValue: (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? String(n) : value;
    },
    sanitizeDraft: (text) => text.replace(/[^\d]/g, "").slice(0, maxLength),
    commitDraft: (draft) => {
      if (!draft) return null;
      const n = Number(draft);
      if (!Number.isInteger(n)) return null;
      const normalized = usesZeroPadding ? String(n).padStart(maxLength, "0") : String(n);
      return allowedValues.has(normalized) ? normalized : null;
    },
  };
}

function toInputAriaLabel(label: string) {
  return label.includes("選択") ? label.replace("選択", "入力") : `${label}を入力`;
}

function Wheel({
  options,
  value,
  onChange,
  ariaLabel,
  cyclic,
  className,
  overlayNumericInput,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  cyclic?: boolean;
  className?: string;
  overlayNumericInput?: OverlayNumericInput;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollEndTimerRef = useRef<number | null>(null);
  const suppressReleaseTimerRef = useRef<number | null>(null);
  // プログラム的に scrollTop を動かす直後の onScroll を無視するためのフラグ
  const suppressScrollRef = useRef(false);
  const blurModeRef = useRef<"commit" | "revert">("commit");
  // ユーザーが操作中の間は外部 value 変更で scrollTop を上書きしない
  const isUserInteractingRef = useRef(false);

  const baseLen = options.length;
  // 巡回時は基本配列を複数回繰り返して中央ブロックからスクロールを始める
  const repeat = cyclic ? 7 : 1;
  const middleStart = cyclic ? baseLen * Math.floor(repeat / 2) : 0;
  const repeatedOptions = useMemo(() => {
    if (!cyclic) return options;
    const arr: Option[] = [];
    for (let i = 0; i < repeat; i++) arr.push(...options);
    return arr;
  }, [cyclic, repeat, options]);

  const valueToIdx = useCallback(
    (v: string) => {
      const i = options.findIndex((o) => o.value === v);
      const bi = i < 0 ? 0 : i;
      return middleStart + bi;
    },
    [options, middleStart],
  );

  const [activeIdx, setActiveIdx] = useState(() => valueToIdx(value));
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const formatDraftValue = useMemo(
    () => overlayNumericInput?.formatValue ?? ((raw: string) => raw),
    [overlayNumericInput],
  );
  const inputValue = isEditing ? draftValue : formatDraftValue(value);

  const releaseSuppressSoon = useCallback((ms = 80) => {
    if (suppressReleaseTimerRef.current != null) window.clearTimeout(suppressReleaseTimerRef.current);
    suppressReleaseTimerRef.current = window.setTimeout(() => {
      suppressScrollRef.current = false;
    }, ms);
  }, []);

  // 外部 value 変化 / マウント時だけスクロール位置を合わせる。
  // ユーザー操作中（指でスクロール中・スナップ待ち）は干渉しない。
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isUserInteractingRef.current) return;
    const idx = valueToIdx(value);
    const currentIdx = Math.round(el.scrollTop / ITEM_H);
    setActiveIdx(idx);
    if (currentIdx === idx) return;
    suppressScrollRef.current = true;
    el.scrollTop = idx * ITEM_H;
    releaseSuppressSoon(60);
  }, [value, valueToIdx, releaseSuppressSoon]);

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current != null) window.clearTimeout(scrollEndTimerRef.current);
      if (suppressReleaseTimerRef.current != null) window.clearTimeout(suppressReleaseTimerRef.current);
    };
  }, []);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // プログラム的スクロール起因の onScroll は無視
    if (suppressScrollRef.current) return;

    isUserInteractingRef.current = true;

    const rawIdx = Math.round(el.scrollTop / ITEM_H);
    const idx = clampIndex(rawIdx, repeatedOptions.length);
    setActiveIdx(idx);

    // 巡回：端ブロックに入ったら中央ブロックの同じ項目へ瞬間的にワープ
    if (cyclic) {
      const low = baseLen;
      const high = baseLen * (repeat - 1);
      if (idx < low || idx >= high) {
        const bi = ((idx - middleStart) % baseLen + baseLen) % baseLen;
        const newIdx = middleStart + bi;
        suppressScrollRef.current = true;
        el.scrollTop = newIdx * ITEM_H;
        setActiveIdx(newIdx);
        releaseSuppressSoon(60);
      }
    }

    // スクロール停止を検知して最終 index を確定・親へ通知
    if (scrollEndTimerRef.current != null) window.clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = window.setTimeout(() => {
      const el2 = ref.current;
      if (!el2) return;
      const finalIdx = clampIndex(Math.round(el2.scrollTop / ITEM_H), repeatedOptions.length);
      const snappedTop = finalIdx * ITEM_H;
      if (Math.abs(el2.scrollTop - snappedTop) > 0.5) {
        suppressScrollRef.current = true;
        el2.scrollTo({ top: snappedTop, behavior: "smooth" });
        releaseSuppressSoon(260);
      }
      setActiveIdx(finalIdx);
      const v = repeatedOptions[finalIdx]?.value;
      isUserInteractingRef.current = false;
      if (v != null && v !== value) onChange(v);
    }, 130);
  }, [baseLen, cyclic, middleStart, onChange, releaseSuppressSoon, repeat, repeatedOptions, value]);

  function openNumericInput() {
    if (!overlayNumericInput) return;
    if (scrollEndTimerRef.current != null) window.clearTimeout(scrollEndTimerRef.current);
    blurModeRef.current = "commit";
    setDraftValue(formatDraftValue(value));
    setIsEditing(true);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      input.select();
    });
  }

  function closeNumericInput(shouldCommit: boolean) {
    if (!overlayNumericInput) return;
    let nextValue = value;
    if (shouldCommit) {
      const normalized = overlayNumericInput.commitDraft(draftValue);
      if (normalized) {
        nextValue = normalized;
        onChange(normalized);
      }
    }
    setDraftValue(formatDraftValue(nextValue));
    setIsEditing(false);
  }

  function handleRowClick(i: number) {
    const el = ref.current;
    if (!el) return;
    if (overlayNumericInput && i === activeIdx) {
      openNumericInput();
      return;
    }
    suppressScrollRef.current = true;
    el.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
    setActiveIdx(i);
    const v = repeatedOptions[i]?.value;
    if (v != null && v !== value) onChange(v);
    releaseSuppressSoon(260);
  }

  return (
    <div className={["relative select-none", className ?? ""].join(" ").trim()}>
      {/* 中央のハイライト枠 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-xl border border-black/10 bg-black/[0.04]"
        style={{ height: `${ITEM_H}px` }}
      />

      <div
        ref={ref}
        role="listbox"
        aria-label={ariaLabel}
        className="overflow-y-auto overscroll-contain rounded-2xl border border-black/10 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          height: `${WHEEL_H}px`,
          paddingTop: `${PAD_Y}px`,
          paddingBottom: `${PAD_Y}px`,
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
        }}
        onScroll={handleScroll}
      >
        {repeatedOptions.map((o, i) => (
          <button
            key={`${o.value}:${i}`}
            type="button"
            data-index={i}
            role="option"
            aria-selected={i === activeIdx}
            className={[
              "flex w-full items-center justify-center px-3 text-center text-[15px] font-medium tabular-nums",
              i === activeIdx ? "text-black" : "text-black/40",
            ].join(" ")}
            style={{
              height: `${ITEM_H}px`,
              lineHeight: `${ITEM_H}px`,
              scrollSnapAlign: "center",
              scrollSnapStop: "always",
            }}
            onClick={() => handleRowClick(i)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* 中央行だけをタップ対象とした透過オーバーレイ（選択中の値を直接入力用に開く） */}
      {overlayNumericInput && !isEditing ? (
        <button
          type="button"
          aria-label={overlayNumericInput.ariaLabel}
          tabIndex={-1}
          className="absolute inset-x-0 top-1/2 z-[15] -translate-y-1/2 cursor-text bg-transparent"
          style={{ height: `${ITEM_H}px` }}
          onClick={openNumericInput}
        />
      ) : null}

      {/* 直接入力オーバーレイ：中央ハイライト位置にだけ表示（テンキーに隠れにくい） */}
      {overlayNumericInput ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          pattern="[0-9]*"
          value={inputValue}
          aria-label={overlayNumericInput.ariaLabel}
          maxLength={overlayNumericInput.maxLength}
          className={[
            "absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 text-center tabular-nums outline-none transition-opacity duration-100",
            isEditing
              ? "w-[calc(100%-0.5rem)] rounded-xl border-2 border-black/80 bg-white px-3 text-xl font-semibold shadow-md"
              : "pointer-events-none h-0 w-0 opacity-0",
          ].join(" ")}
          style={isEditing ? { height: `${ITEM_H + 8}px` } : undefined}
          onChange={(e) => {
            const sanitized = overlayNumericInput.sanitizeDraft?.(e.target.value) ?? e.target.value;
            setDraftValue(sanitized);
          }}
          onFocus={(e) => {
            blurModeRef.current = "commit";
            setDraftValue(formatDraftValue(value));
            setIsEditing(true);
            const el = e.currentTarget;
            requestAnimationFrame(() => {
              if (document.activeElement === el) el.select();
            });
          }}
          onBlur={() => {
            const mode = blurModeRef.current;
            blurModeRef.current = "commit";
            closeNumericInput(mode === "commit");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              blurModeRef.current = "commit";
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              blurModeRef.current = "revert";
              e.currentTarget.blur();
            }
          }}
        />
      ) : null}
    </div>
  );
}

// ダイアログ共通のクラス：画面上部寄せでモバイルのソフトキーボードに隠れにくい配置
const DIALOG_CLASS =
  "fixed left-1/2 top-4 m-0 w-[min(520px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] -translate-x-1/2 overflow-visible rounded-2xl border border-black/10 bg-white p-0 shadow-xl backdrop:bg-black/40 sm:top-[8vh]";

export function DrumPickerDialog({
  title,
  options,
  value,
  onSelect,
  triggerLabel,
  ariaLabel,
}: {
  title: string;
  options: Option[];
  value: string;
  onSelect: (value: string) => void;
  triggerLabel: string;
  ariaLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [current, setCurrent] = useState(value);
  const numericOverlayInput = useMemo(
    () => buildNumericOverlayInput(options, { ariaLabel: toInputAriaLabel(ariaLabel) }),
    [ariaLabel, options],
  );

  useEffect(() => {
    // eslint-disable-next-line
    setCurrent(value);
  }, [value]);

  const currentLabel = useMemo(
    () => options.find((o) => o.value === current)?.label ?? triggerLabel,
    [current, options, triggerLabel],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 hover:bg-black/[0.03]"
      >
        <span className="text-sm font-semibold tracking-tight text-black tabular-nums">{currentLabel}</span>
      </button>

      <dialog ref={dialogRef} className={DIALOG_CLASS}>
        <div className="border-b border-black/10 px-5 py-3 text-center">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs text-black/50">
            {numericOverlayInput
              ? "ホイールを回すか、中央の値をタップして直接入力できます。"
              : "ホイールを回して選択してください。"}
          </div>
        </div>

        <div className="p-4">
          <Wheel
            options={options}
            value={current}
            onChange={(v) => setCurrent(v)}
            ariaLabel={ariaLabel}
            overlayNumericInput={numericOverlayInput}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-black/10 px-5 py-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => {
              onSelect(current);
              dialogRef.current?.close();
            }}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
          >
            移動
          </button>
        </div>
      </dialog>
    </>
  );
}

export function DrumYearMonthDialog({
  title,
  value, // YYYY-MM
  onSelect,
  triggerLabel,
}: {
  title: string;
  value: string;
  onSelect: (value: string) => void;
  triggerLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const parseYearMonth = useCallback((v: string) => {
    const m = v.match(/^(\d{4})-(\d{2})$/);
    return {
      year: m ? Number(m[1]) : new Date().getFullYear(),
      month: m ? Number(m[2]) : new Date().getMonth() + 1,
    };
  }, []);
  const { year: initialYear, month: initialMonth } = useMemo(() => parseYearMonth(value), [parseYearMonth, value]);

  const [isOpen, setIsOpen] = useState(false);
  const [openNonce, setOpenNonce] = useState(0);
  const [y, setY] = useState<number>(initialYear);
  const [mo, setMo] = useState<number>(initialMonth);

  useEffect(() => {
    // ダイアログを閉じている間にURL側の月が変わった場合のみ同期する。
    // （キャンセル→再オープンで直前のドラフトが残るようにする）
    if (isOpen) return;
    const mm = value.match(/^(\d{4})-(\d{2})$/);
    if (!mm) return;
    // eslint-disable-next-line
    setY(Number(mm[1]));
    setMo(Number(mm[2]));
  }, [value, isOpen]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const onClose = () => setIsOpen(false);
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, []);

  const yearOptions = useMemo(() => {
    const out: Option[] = [];
    for (let yy = 1900; yy <= 2200; yy++) out.push({ value: String(yy), label: `${yy}年` });
    return out;
  }, []);
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        value: String(i + 1).padStart(2, "0"),
        label: `${i + 1}月`,
      })),
    [],
  );
  const yearOverlayInput = useMemo(
    () =>
      buildNumericOverlayInput(yearOptions, {
        ariaLabel: "年を入力",
        helperText: "中央の年をタップすると直接入力できます。",
      }),
    [yearOptions],
  );
  const monthOverlayInput = useMemo(
    () =>
      buildNumericOverlayInput(monthOptions, {
        ariaLabel: "月を入力",
        helperText: "中央の月をタップすると直接入力できます。",
      }),
    [monthOptions],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // カレンダー側の value が直前に変わった場合でも、開く瞬間に確実に同期する
          const { year, month } = parseYearMonth(value);
          setY(year);
          setMo(month);
          // 前回の操作途中で閉じた場合などにホイール内部の「操作中」状態が残ることがあるため、
          // 開くたびにホイールを再マウントして初期位置合わせを確実にする
          setOpenNonce((n) => n + 1);
          setIsOpen(true);
          dialogRef.current?.showModal();
        }}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 hover:bg-black/[0.03]"
      >
        <span className="text-sm font-semibold tracking-tight text-black tabular-nums">{triggerLabel}</span>
      </button>

      <dialog ref={dialogRef} className={DIALOG_CLASS}>
        <div className="border-b border-black/10 px-5 py-3 text-center">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs text-black/50">
            年・月のホイールを回すか、中央の値をタップして直接入力できます。
          </div>
        </div>

        <div className="p-4">
          <div className="flex justify-center gap-3">
            <Wheel
              key={`ym:${openNonce}:year`}
              options={yearOptions}
              value={String(y)}
              onChange={(v) => setY(Number(v))}
              ariaLabel="年"
              className="w-[min(220px,calc((100vw-4rem-0.75rem)/2))]"
              overlayNumericInput={yearOverlayInput}
            />
            <Wheel
              key={`ym:${openNonce}:month`}
              options={monthOptions}
              value={String(mo).padStart(2, "0")}
              onChange={(v) => setMo(Number(v))}
              ariaLabel="月"
              cyclic
              className="w-[min(220px,calc((100vw-4rem-0.75rem)/2))]"
              overlayNumericInput={monthOverlayInput}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-black/10 px-5 py-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => {
              onSelect(`${y}-${String(mo).padStart(2, "0")}`);
              dialogRef.current?.close();
            }}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
          >
            移動
          </button>
        </div>
      </dialog>
    </>
  );
}
