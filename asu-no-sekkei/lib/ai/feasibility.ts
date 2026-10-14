import { daysBetween } from "../goals";
import type { DateKey } from "../types";

/**
 * 期限までに使える時間の計算（AI を使わない、決まった計算）。
 * AI の「間に合うか」の判断とは別に、ユーザーが入力した週あたりの時間から機械的に求める。
 */

/** 今日から期限まで（両端を含む）の日数。期限が過去なら 0 */
export function daysUntil(today: DateKey, deadline: DateKey): number {
  return Math.max(0, daysBetween(today, deadline) + 1);
}

/** 期限までに使える時間（分）。週あたりの時間 × 日数 / 7（切り捨て） */
export function capacityMinutes(today: DateKey, deadline: DateKey | null, weeklyMinutes: number | null): number | null {
  if (!deadline || weeklyMinutes === null) return null;
  return Math.floor((daysUntil(today, deadline) * weeklyMinutes) / 7);
}

export type CapacityStatus = "ok" | "tight" | "short" | "unknown";

export interface CapacityCheck {
  status: CapacityStatus;
  requiredMinutes: number;
  capacityMinutes: number | null;
  /** 不足する時間（分）。足りていれば 0 */
  shortageMinutes: number;
}

/** 必要な時間と使える時間を比べる。8割を超えたら「ぎりぎり」、超えたら「不足」 */
export function checkCapacity(requiredMinutes: number, capacity: number | null): CapacityCheck {
  if (capacity === null) return { status: "unknown", requiredMinutes, capacityMinutes: null, shortageMinutes: 0 };
  const shortage = Math.max(0, requiredMinutes - capacity);
  const status: CapacityStatus = shortage > 0 ? "short" : requiredMinutes > capacity * 0.8 ? "tight" : "ok";
  return { status, requiredMinutes, capacityMinutes: capacity, shortageMinutes: shortage };
}
