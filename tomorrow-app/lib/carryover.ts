import type { Task } from "./types";

/**
 * 明日より前の日付のまま未完了のタスクを明日に持ち越す。
 * 完了済みは持ち越さない。変更がなければ同じ配列を返す。
 */
export function carryOverTasks(tasks: Task[], tomorrowKey: string): Task[] {
  let changed = false;
  const next = tasks.map((t) => {
    // "YYYY-MM-DD" は文字列比較で日付の前後が判定できる
    if (t.completed || t.targetDate >= tomorrowKey) return t;
    changed = true;
    return { ...t, targetDate: tomorrowKey, carriedOverFrom: t.carriedOverFrom ?? t.targetDate };
  });
  return changed ? next : tasks;
}
