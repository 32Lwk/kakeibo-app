"use client";

import { useId, useMemo, useRef, useState } from "react";

type Option = { value: string; label: string; description?: string };

export function ModalSelect({
  name,
  label,
  value,
  options,
  disabled,
}: {
  name: string;
  label: string;
  value: string;
  options: Option[];
  disabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const id = useId();
  const [current, setCurrent] = useState(value);
  const currentLabel = useMemo(() => options.find((o) => o.value === current)?.label ?? current, [current, options]);

  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">{label}</div>
      <input type="hidden" name={name} value={current} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
        className="flex w-full items-center justify-between rounded-xl border border-black/15 bg-white px-3 py-2 text-left text-sm hover:bg-black/[0.03] disabled:opacity-40"
      >
        <span className="text-black/80">{currentLabel}</span>
        <span className="text-black/40">変更</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={id}
        className="w-[min(520px,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-white p-0 shadow-xl backdrop:bg-black/40"
      >
        <div className="border-b border-black/10 px-5 py-4">
          <div id={id} className="text-sm font-semibold">
            {label}
          </div>
          <div className="mt-1 text-xs text-black/50">選択すると自動で反映されます。</div>
        </div>
        <div className="max-h-[60vh] overflow-auto p-2">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setCurrent(o.value);
                dialogRef.current?.close();
              }}
              className={[
                "w-full rounded-xl px-4 py-3 text-left hover:bg-black/[0.03]",
                current === o.value ? "bg-black text-white hover:bg-black/90" : "text-black/80",
              ].join(" ")}
            >
              <div className="text-sm font-medium">{o.label}</div>
              {o.description ? <div className={["mt-1 text-xs", current === o.value ? "text-white/70" : "text-black/50"].join(" ")}>{o.description}</div> : null}
            </button>
          ))}
        </div>
        <div className="border-t border-black/10 px-5 py-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
            >
              閉じる
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

