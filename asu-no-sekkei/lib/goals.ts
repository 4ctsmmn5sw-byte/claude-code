import { addDays } from "./date";
import type { DateKey, Goal, GoalPriority, GoalStatus, GoalStep, StepStatus, Task, WorkLog } from "./types";

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  wish: "やりたいこと",
  active: "取り組み中",
  paused: "一時停止",
  dropped: "やめた",
};

export const PRIORITY_LABELS: Record<GoalPriority, string> = { high: "高", medium: "中", low: "低" };
const PRIORITY_RANK: Record<GoalPriority, number> = { high: 0, medium: 1, low: 2 };

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  todo: "未着手",
  doing: "進行中",
  done: "完了",
  skipped: "省略",
};

/** 工程を作業順序で並べる */
export function stepsOf(steps: GoalStep[], goalId: string): GoalStep[] {
  return steps.filter((s) => s.goalId === goalId).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

/**
 * stepId の前提に deps を設定すると循環するか。
 * deps のどれかから前提をたどって stepId に戻れるなら循環。
 */
export function wouldCreateCycle(steps: GoalStep[], stepId: string, deps: string[]): boolean {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const stack = [...deps];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === stepId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.dependsOn ?? []));
  }
  return false;
}

/** 前提の工程のうち、まだ終わっていない（完了・省略でない）もの */
export function unfinishedDependencies(steps: GoalStep[], step: GoalStep): GoalStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  return step.dependsOn
    .map((id) => byId.get(id))
    .filter((s): s is GoalStep => s !== undefined && s.status !== "done" && s.status !== "skipped");
}

export interface GoalStats {
  stepsTotal: number;
  stepsDone: number;
  /** 想定必要時間（目標に設定した値、なければ工程の想定時間の合計。どちらもなければ null） */
  estimatedMinutes: number | null;
  /** 工程の想定時間の合計（未設定の工程は数えない） */
  stepsEstimatedMinutes: number;
  /** 作業時間の実績（WorkLog の合計） */
  actualMinutes: number;
  /** 終わっていない工程の残り必要時間の合計（推定総時間 − 実績） */
  remainingStepMinutes: number;
  /** 次に取り組める工程（前提が済んでいて未完了の最初の工程） */
  nextStep: GoalStep | null;
  /** 期限までの日数（今日が期限なら 0、過ぎていれば負）。期限なしは null */
  daysLeft: number | null;
}

export function daysBetween(from: DateKey, to: DateKey): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function goalStats(goal: Goal, allSteps: GoalStep[], logs: WorkLog[], today: DateKey): GoalStats {
  const steps = stepsOf(allSteps, goal.id);
  const active = steps.filter((s) => s.status !== "skipped");
  const stepsEstimatedMinutes = active.reduce((sum, s) => sum + (s.estimatedMinutes ?? 0), 0);
  // 工程の残り必要時間 = 推定総時間 − その工程の実績（0 未満にしない）
  const remainingStepMinutes = active
    .filter((s) => s.status !== "done")
    .reduce((sum, s) => {
      const actual = logs.filter((l) => l.stepId === s.id).reduce((a, l) => a + l.minutes, 0);
      return sum + Math.max(0, (s.estimatedMinutes ?? 0) - actual);
    }, 0);
  const nextStep =
    steps.find((s) => (s.status === "todo" || s.status === "doing") && unfinishedDependencies(allSteps, s).length === 0) ?? null;
  return {
    stepsTotal: active.length,
    stepsDone: active.filter((s) => s.status === "done").length,
    estimatedMinutes: goal.estimatedMinutes ?? (stepsEstimatedMinutes > 0 ? stepsEstimatedMinutes : null),
    stepsEstimatedMinutes,
    actualMinutes: logs.filter((l) => l.goalId === goal.id).reduce((sum, l) => sum + l.minutes, 0),
    remainingStepMinutes,
    nextStep,
    daysLeft: goal.deadline ? daysBetween(today, goal.deadline) : null,
  };
}

/** 一覧の並び：達成済みは後ろ、優先度が高い順、期限が近い順、作成順 */
export function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    if (!!a.achievedAt !== !!b.achievedAt) return a.achievedAt ? 1 : -1;
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (a.deadline !== b.deadline) return a.deadline === null ? 1 : b.deadline === null ? -1 : a.deadline.localeCompare(b.deadline);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** 目標一覧のタブ分け */
export type GoalTab = "active" | "wish" | "done";

export function goalTab(goal: Goal): GoalTab {
  if (goal.achievedAt || goal.status === "dropped") return "done";
  return goal.status === "wish" ? "wish" : "active";
}

/** 工程に紐づくタスク */
export function tasksOfStep(tasks: Task[], stepId: string): Task[] {
  return tasks.filter((t) => t.stepId === stepId);
}

/** 期限の表示（「あと3日」「今日まで」「5日超過」） */
export function deadlineLabel(daysLeft: number | null): string | null {
  if (daysLeft === null) return null;
  if (daysLeft > 0) return `あと${daysLeft}日`;
  if (daysLeft === 0) return "今日まで";
  return `${-daysLeft}日超過`;
}

/** 指定日から n 日間（今日を含む）の実績合計 */
export function minutesInRange(logs: WorkLog[], from: DateKey, days: number): number {
  const to = addDays(from, days - 1);
  return logs.filter((l) => l.date >= from && l.date <= to).reduce((s, l) => s + l.minutes, 0);
}
