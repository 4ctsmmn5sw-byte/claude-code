import { DAY_MINUTES } from "./time";
import { weekdayOf } from "./date";
import type { DateKey, FixedEvent, Interval, Task } from "./types";

/** 曜日と適用期間から、その日が繰り返しの対象日か（「休み」かどうかは見ない） */
export function fixedEventAppliesTo(e: FixedEvent, date: DateKey): boolean {
  if (!e.weekdays.includes(weekdayOf(date))) return false;
  if (e.validFrom && date < e.validFrom) return false;
  if (e.validTo && date > e.validTo) return false;
  return true;
}

/** その日に有効な固定予定（規則から展開する。保存はしない）。「この日だけ休み」は除く */
export function fixedEventsForDate(events: FixedEvent[], date: DateKey): FixedEvent[] {
  return events
    .filter((e) => fixedEventAppliesTo(e, date) && !e.skipDates.includes(date))
    .sort((a, b) => a.startMin - b.startMin);
}

/** その日に「休み」にしている固定予定（取り消せるよう薄く表示する） */
export function skippedFixedEventsForDate(events: FixedEvent[], date: DateKey): FixedEvent[] {
  return events
    .filter((e) => fixedEventAppliesTo(e, date) && e.skipDates.includes(date))
    .sort((a, b) => a.startMin - b.startMin);
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

/** 毎週の規則の形（保存前の入力にも使えるよう、FixedEvent の一部だけを受け取る） */
export type WeeklyRule = Pick<FixedEvent, "weekdays" | "startMin" | "endMin" | "validFrom" | "validTo"> & {
  skipDates?: DateKey[];
};

export interface RuleConflicts {
  /** 規則の対象日に配置済みで、時間が重なるタスク（日付順） */
  tasks: (Task & { startMin: number; date: DateKey })[];
  /** 曜日・期間・時間が重なる他の固定予定 */
  fixed: FixedEvent[];
}

/**
 * 毎週の規則を保存したときに重なる既存の予定を調べる。
 * 重なっても予定を削除・移動することはせず、画面で警告するためだけに使う。
 */
export function ruleConflicts(
  rule: WeeklyRule,
  tasks: Task[],
  events: FixedEvent[],
  opts: { excludeEventId?: string; excludeTaskId?: string } = {},
): RuleConflicts {
  const asEvent = { ...rule, skipDates: rule.skipDates ?? [] } as FixedEvent;
  const conflictTasks = tasks
    .filter(
      (t): t is Task & { startMin: number; date: DateKey } =>
        t.id !== opts.excludeTaskId &&
        t.date !== null &&
        t.startMin !== null &&
        fixedEventAppliesTo(asEvent, t.date) &&
        !asEvent.skipDates.includes(t.date) &&
        overlaps(rule.startMin, rule.endMin, t.startMin, t.startMin + t.durationMin),
    )
    .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1));
  const rangesOverlap = (e: FixedEvent) =>
    (!rule.validTo || !e.validFrom || e.validFrom <= rule.validTo) && (!e.validTo || !rule.validFrom || rule.validFrom <= e.validTo);
  const conflictFixed = events.filter(
    (e) =>
      e.id !== opts.excludeEventId &&
      e.weekdays.some((w) => rule.weekdays.includes(w)) &&
      overlaps(rule.startMin, rule.endMin, e.startMin, e.endMin) &&
      rangesOverlap(e),
  );
  return { tasks: conflictTasks, fixed: conflictFixed };
}
