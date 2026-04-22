"use client";

import { useCallback, useId, useState } from "react";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"] as const;
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : i === 1 ? 0 : 1;
  return `${v.toFixed(digits)}${units[i]}`;
}

export function FilePicker({
  name,
  accept,
  required,
}: {
  name: string;
  accept?: string;
  required?: boolean;
}) {
  const id = useId();
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0] ?? null;
    setFileName(f?.name ?? "");
    setFileSize(f?.size ?? 0);
  }, []);

  const selected = Boolean(fileName);
  return (
    <div className="space-y-2">
      <input id={id} name={name} type="file" accept={accept} required={required} className="sr-only" onChange={onChange} />

      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
        >
          ファイルを選択
        </label>
        <div className={["text-sm", selected ? "text-black/70" : "text-black/40"].join(" ")}>
          {selected ? (
            <>
              選択済み: <span className="font-medium text-black/80">{fileName}</span>
              {fileSize ? <span className="ml-2 text-black/50">({formatBytes(fileSize)})</span> : null}
            </>
          ) : (
            "未選択"
          )}
        </div>
      </div>
    </div>
  );
}

