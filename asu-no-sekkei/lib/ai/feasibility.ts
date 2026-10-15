import { daysBetween } from "../goals";
import type { DateKey } from "../types";
import type { AiResponse, PlanRequest } from "./planSchema";

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

/* ---------- 期限までの見通し（AI を使わず、アプリが計算する） ---------- */

export interface PlanMetrics {
  /** 今日から期限まで（両端を含む）の日数。期限がなければ null */
  days: number | null;
  /** 期限までに使える時間（分）。期限か週の時間がなければ null */
  capacityMinutes: number | null;
  /** 今回の計画（提案された工程）の必要時間の合計（分） */
  planMinutes: number;
  /** 残りの作業時間（分）＝ 既存の未完了の工程 ＋ 今回の計画 */
  remainingMinutes: number;
  /** 期限までに終えるために必要な 1 週間あたりの作業時間（分）。期限がない・過ぎていれば null */
  requiredWeeklyMinutes: number | null;
  status: CapacityStatus;
  shortageMinutes: number;
}

export function planMetrics(input: {
  today: DateKey;
  deadline: DateKey | null;
  weeklyMinutes: number | null;
  planMinutes: number;
  existingRemainingMinutes?: number;
}): PlanMetrics {
  const planMinutes = Math.max(0, Math.round(input.planMinutes));
  const remainingMinutes = planMinutes + Math.max(0, Math.round(input.existingRemainingMinutes ?? 0));
  const days = input.deadline ? daysUntil(input.today, input.deadline) : null;
  const capacity = capacityMinutes(input.today, input.deadline, input.weeklyMinutes);
  const cap = checkCapacity(remainingMinutes, capacity);
  return {
    days,
    capacityMinutes: capacity,
    planMinutes,
    remainingMinutes,
    requiredWeeklyMinutes: requiredWeeklyMinutes(remainingMinutes, days),
    status: cap.status,
    shortageMinutes: cap.shortageMinutes,
  };
}

/** 残りの作業を期限までに終えるのに必要な、1 週間あたりの作業時間（分、切り上げ） */
export function requiredWeeklyMinutes(remainingMinutes: number, days: number | null): number | null {
  if (days === null || days <= 0) return null;
  return Math.ceil((remainingMinutes * 7) / days);
}

/** 計算結果から、期限に間に合うかの判断（AI の判断ではなく、この数値を根拠にする） */
export function feasibilityStatus(m: PlanMetrics): "ok" | "tight" | "unlikely" | "unknown" {
  if (m.days !== null && m.days <= 0 && m.remainingMinutes > 0) return "unlikely";
  return m.status === "short" ? "unlikely" : m.status;
}

/** 時間・日数の数値を含む文（AI が独自に計算した可能性がある）かどうか */
export function mentionsQuantities(text: string): boolean {
  return /[0-9０-９]|[一二三四五六七八九十百千半]+\s*(時間|分|日|週|か月|ヶ月|カ月|ヵ月|年)/.test(text);
}

/**
 * AI の応答の「期限に間に合うか」を、アプリが計算した数値で置き換える（サーバー側で必ず行う）。
 * - status：計算結果から決める（AI の判断は使わない）
 * - reason：AI の文のうち、時間・日数などの数値を含まないもの（進め方や注意点）だけを残す。
 *   数値は画面でアプリの計算結果を表示する
 */
export function applyComputedFeasibility(req: PlanRequest, data: AiResponse): AiResponse {
  if (!data.ready) return data;
  const m = planMetrics({
    today: req.today,
    deadline: req.goal.deadline,
    weeklyMinutes: req.weeklyMinutes,
    planMinutes: data.plan.steps.reduce((sum, s) => sum + s.estimatedMinutes, 0),
    existingRemainingMinutes: req.existingRemainingMinutes,
  });
  const reason = data.plan.feasibility.reason.trim();
  return {
    ...data,
    plan: { ...data.plan, feasibility: { status: feasibilityStatus(m), reason: reason && !mentionsQuantities(reason) ? reason : "" } },
  };
}

/** AI に渡す「計算済みの事実」（AI に日付や時間を計算させないため） */
export function computedFacts(req: PlanRequest) {
  const days = req.goal.deadline ? daysUntil(req.today, req.goal.deadline) : null;
  return {
    daysUntilDeadline: days,
    availableMinutesUntilDeadline: capacityMinutes(req.today, req.goal.deadline, req.weeklyMinutes),
    existingRemainingMinutes: req.existingRemainingMinutes ?? 0,
  };
}
