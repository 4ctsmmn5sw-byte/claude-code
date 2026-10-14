"use client";

import { useSyncExternalStore } from "react";
import { nowMinutesInTokyo, todayKey } from "@/lib/date";

/**
 * Asia/Tokyo の「今日」と現在時刻（分）を購読する。
 * 30 秒ごとと、タブに戻ったときに再計算するので、日付をまたいでも「今日」「明日」の表示が追従する。
 */
function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 30_000);
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export function useTokyoToday(): string | null {
  return useSyncExternalStore(subscribe, () => todayKey(), () => null);
}

export function useTokyoNowMinutes(): number | null {
  return useSyncExternalStore(subscribe, () => nowMinutesInTokyo(), () => null);
}
