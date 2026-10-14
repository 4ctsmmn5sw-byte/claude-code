"use client";

import type { ToastState } from "@/hooks/useToast";

export function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center px-4"
    >
      {toast && (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          data-testid="toast"
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${
            toast.tone === "error" ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-neutral-900 text-white ring-neutral-900"
          }`}
        >
          <span className="leading-relaxed">{toast.message}</span>
          <button type="button" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100" aria-label="閉じる">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
