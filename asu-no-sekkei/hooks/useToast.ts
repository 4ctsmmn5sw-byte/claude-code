"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastTone = "info" | "error";
export interface ToastAction {
  label: string;
  run: () => void;
}
export interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

export function useToast(durationMs = 3500) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback(
    (message: string, tone: ToastTone = "info", action?: ToastAction) => {
      window.clearTimeout(timer.current);
      setToast({ id: performance.now(), message, tone, action });
      timer.current = window.setTimeout(() => setToast(null), action ? durationMs + 2000 : durationMs);
    },
    [durationMs],
  );

  const hide = useCallback(() => setToast(null), []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { toast, show, hide };
}
