"use client";

import { useEffect, type ReactNode } from "react";

/** 下から出るシート型のモーダル（スマホで片手で届く位置に操作を置く） */
export function Modal({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-neutral-900/35 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className="max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[24px] bg-white px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl"
      >
        <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-neutral-300" aria-hidden />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 grid size-11 place-items-center rounded-full text-neutral-500 active:bg-neutral-100"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
