"use client";

import { useFormStatus } from "react-dom";

export function FormSubmitButton({
  children,
  pendingText = "処理中…",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-disabled={pending}>
      <span className="inline-flex items-center gap-2">
        {pending ? (
          <>
            <span
              className="inline-block size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              aria-hidden="true"
            />
            <span>{pendingText}</span>
          </>
        ) : (
          children
        )}
      </span>
    </button>
  );
}

