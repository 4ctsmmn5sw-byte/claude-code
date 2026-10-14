"use client";

import type { ToastState } from "@/hooks/useToast";

/** 画面上部（ヘッダーの下）に出る通知。親指で隠れない位置に置く */
export function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+108px)] z-[80] flex justify-center px-4"
    >
      {toast && (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          data-testid="toast"
          className={`pointer-events-auto flex min-h-11 max-w-md items-center gap-2 rounded-2xl py-1.5 pl-4 pr-1.5 text-sm shadow-lg ${
            toast.tone === "error" ? "bg-rose-600 text-white" : "bg-neutral-900 text-white"
          }`}
        >
          <span className="leading-snug">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="h-11 shrink-0 rounded-xl bg-white/15 px-3 font-semibold active:bg-white/25"
              onClick={() => {
                toast.action!.run();
                onClose();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center opacity-70" aria-label="閉じる">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
