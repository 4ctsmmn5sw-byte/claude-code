import { DAY_MINUTES } from "./time";
import { weekdayOf } from "./date";
import type { DateKey, FixedEvent, Interval, Task } from "./types";

/** その日に表示する固定予定（規則から展開する。保存はしない） */
export function fixedEventsForDate(events: FixedEvent[], date: DateKey): FixedEvent[] {
  const wd = weekdayOf(date);
  return events.filter((e) => e.weekdays.includes(wd)).sort((a, b) => a.startMin - b.startMin);
}

/** その日に配置されたタスク */
export function placedTasksForDate(tasks: Task[], date: DateKey): (Task & { startMin: number })[] {
  return tasks
    .filter((t): t is Task & { startMin: number } => t.date === date && t.startMin !== null)
    .sort((a, b) => a.startMin - b.startMin);
}

export function unplacedTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.startMin === null || t.date === null);
}

/** [start, end) の半開区間として重なりを判定する（隣接は重複ではない） */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** その日の占有区間（固定予定 + 配置済みタスク）。excludeTaskId は判定対象自身を除外する */
export function occupiedIntervals(
  tasks: Task[],
  events: FixedEvent[],
  date: DateKey,
  excludeTaskId?: string,
): Interval[] {
  const fixed: Interval[] = fixedEventsForDate(events, date).map((e) => ({
    id: e.id,
    kind: "fixed",
    title: e.title,
    startMin: e.startMin,
    endMin: e.endMin,
  }));
  const placed: Interval[] = placedTasksForDate(tasks, date)
    .filter((t) => t.id !== excludeTaskId)
    .map((t) => ({ id: t.id, kind: "task", title: t.title, startMin: t.startMin, endMin: t.startMin + t.durationMin }));
  return [...fixed, ...placed];
}

export type PlacementCheck =
  | { ok: true }
  | { ok: false; reason: "out-of-range" | "too-short"; message: string }
  | { ok: false; reason: "overlap"; message: string; conflicts: Interval[] };

/**
 * タスクを date の startMin〜endMin に置けるか判定する。
 * 0:00〜24:00 の外・長さ 0 以下・固定予定や他タスクとの重複は不可。
 */
export function checkPlacement(
  tasks: Task[],
  events: FixedEvent[],
  date: DateKey,
  taskId: string,
  startMin: number,
  endMin: number,
): PlacementCheck {
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) {
    return { ok: false, reason: "out-of-range", message: "時刻は1分単位で指定してください" };
  }
  if (startMin < 0 || endMin > DAY_MINUTES) {
    return { ok: false, reason: "out-of-range", message: "0:00〜24:00の範囲に収めてください" };
  }
  if (endMin <= startMin) {
    return { ok: false, reason: "too-short", message: "終了時刻は開始時刻より後にしてください" };
  }
  const conflicts = occupiedIntervals(tasks, events, date, taskId).filter((i) =>
    overlaps(startMin, endMin, i.startMin, i.endMin),
  );
  if (conflicts.length > 0) {
    const names = conflicts.map((c) => `${c.kind === "fixed" ? "固定予定" : "タスク"}「${c.title}」`).join("、");
    return { ok: false, reason: "overlap", message: `${names}と重なるため配置できません`, conflicts };
  }
  return { ok: true };
}

/**
 * 既に保存済みだが重複している配置済みタスクの ID
 * （固定予定を後から追加・変更した場合などに発生しうる。自動では動かさず警告表示にとどめる）
 */
export function conflictingTaskIds(tasks: Task[], events: FixedEvent[], date: DateKey): Set<string> {
  const result = new Set<string>();
  const placed = placedTasksForDate(tasks, date);
  for (const t of placed) {
    const check = checkPlacement(tasks, events, date, t.id, t.startMin, t.startMin + t.durationMin);
    if (!check.ok) result.add(t.id);
  }
  return result;
}
