"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastTone = "info" | "error";
export interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

export function useToast(durationMs = 3500) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback(
    (message: string, tone: ToastTone = "info") => {
      window.clearTimeout(timer.current);
      setToast({ id: Date.now(), message, tone });
      timer.current = window.setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { toast, show, hide: () => setToast(null) };
}
