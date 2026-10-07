import type { Task } from "./types";

/** タスクを明日に持ち越す。最初に予定していた日を carriedOverFrom に残す */
export function carryOverTask(task: Task, tomorrowKey: string): Task {
  return { ...task, targetDate: tomorrowKey, carriedOverFrom: task.carriedOverFrom ?? task.targetDate };
}

/**
 * 旧バージョンは日付が変わると未完了タスクを自動で明日へ移していた（手動の持ち越しは無かった）。
 * そのため carriedOverFrom を持つタスクはすべて自動で移されたもの。元の日付に戻す。
 */
export function revertLegacyAutoCarryOver(tasks: Task[]): Task[] {
  return tasks.map((t) => {
    if (!t.carriedOverFrom) return t;
    const { carriedOverFrom, ...rest } = t;
    return { ...rest, targetDate: carriedOverFrom };
  });
}
