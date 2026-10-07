import { minutesToTime, timeToMinutes } from "./date";
import { buildSchedule, roundUpToFiveMinutes, type Schedule, type ScheduleSlot } from "./schedule";
import type { DaySettings, Task } from "./types";

type Slot = { start: number; end: number };

/** 今日の画面に出るタスク: 今日の予定 + 過ぎた日の未完了 */
export function isTodayTask(task: Task, todayKey: string): boolean {
  return task.targetDate === todayKey || (task.targetDate < todayKey && !task.completed);
}

const overlaps = (a: Slot, b: Slot) => a.start < b.end && b.start < a.end;

function withSlot(task: Task, slot?: Slot): Task {
  const next = { ...task };
  if (slot) next.scheduledSlot = slot;
  else delete next.scheduledSlot;
  return next;
}

function settingsValid(settings: DaySettings): boolean {
  const start = timeToMinutes(settings.dayStart);
  const end = timeToMinutes(settings.dayEnd);
  return start !== null && end !== null && end > start;
}

/** fixed の枠を避けて、toPlace を現在時刻以降に割り当てる */
function place(toPlace: Task[], fixed: Task[], settings: DaySettings, nowMinutes: number): Map<string, Slot> {
  const schedule = buildSchedule(toPlace, settings, {
    from: roundUpToFiveMinutes(nowMinutes),
    fixed: fixed.map((t) => ({ task: t, start: t.scheduledSlot!.start, end: t.scheduledSlot!.end, late: false })),
  });
  const ids = new Set(toPlace.map((t) => t.id));
  const placed = new Map<string, Slot>();
  if (schedule.ok) {
    for (const s of schedule.slots) if (ids.has(s.task.id)) placed.set(s.task.id, { start: s.start, end: s.end });
  }
  return placed;
}

/**
 * 今日の予定時間（scheduledSlot）を整える。既存の予定は維持し、次の場合だけ変更する。
 * - resetOverdue: 過ぎた日の未完了タスクに残る前日の予定を消す（その日に最初に開いたとき）
 * - 所要時間が変わった未完了タスク: 開始はそのままで終了を合わせる。他と重なる／終了時刻を超えるなら置き直し
 * - 予定時間のない未完了タスク: 現在時刻以降の空き時間に割り当てる（入らなければ予定なしのまま）
 * 変更がなければ同じ配列を返す。
 */
export function fillTodaySlots(
  tasks: Task[],
  todayKey: string,
  settings: DaySettings,
  nowMinutes: number,
  { resetOverdue = false }: { resetOverdue?: boolean } = {},
): Task[] {
  if (!settingsValid(settings)) return tasks;
  const dayEnd = timeToMinutes(settings.dayEnd)!;
  let changed = false;

  let next = tasks.map((t) => {
    if (resetOverdue && isTodayTask(t, todayKey) && t.targetDate < todayKey && t.scheduledSlot) {
      changed = true;
      return withSlot(t);
    }
    return t;
  });

  next = next.map((t, _, all) => {
    if (!isTodayTask(t, todayKey) || t.completed || !t.scheduledSlot) return t;
    const { start, end } = t.scheduledSlot;
    if (end - start === t.estimatedMinutes) return t;
    const resized = { start, end: start + t.estimatedMinutes };
    const conflict =
      resized.end > dayEnd ||
      all.some((o) => o.id !== t.id && isTodayTask(o, todayKey) && o.scheduledSlot && overlaps(o.scheduledSlot, resized));
    changed = true;
    return withSlot(t, conflict ? undefined : resized);
  });

  const today = next.filter((t) => isTodayTask(t, todayKey));
  const toPlace = today.filter((t) => !t.completed && !t.scheduledSlot);
  if (toPlace.length > 0) {
    const placed = place(toPlace, today.filter((t) => t.scheduledSlot), settings, nowMinutes);
    if (placed.size > 0) {
      changed = true;
      next = next.map((t) => (placed.has(t.id) ? withSlot(t, placed.get(t.id)) : t));
    }
  }
  return changed ? next : tasks;
}

/** 「今から組み直す」: 完了済みの予定は固定し、未完了タスクを現在時刻以降に並べ直す */
export function replanToday(tasks: Task[], todayKey: string, settings: DaySettings, nowMinutes: number): Task[] {
  if (!settingsValid(settings)) return tasks;
  const cleared = tasks.map((t) => (isTodayTask(t, todayKey) && !t.completed && t.scheduledSlot ? withSlot(t) : t));
  return fillTodaySlots(cleared, todayKey, settings, nowMinutes);
}

/** 保存済みの予定時間から今日のスケジュールを組み立てる（時間の経過では動かない） */
export function todayScheduleFromSlots(todayTasks: Task[], settings: DaySettings): Schedule {
  const dayStart = timeToMinutes(settings.dayStart);
  const dayEnd = timeToMinutes(settings.dayEnd);
  if (dayStart === null || dayEnd === null) return { ok: false, error: "開始時刻と終了時刻を入力してください" };
  if (dayEnd <= dayStart) return { ok: false, error: "終了時刻は開始時刻より後にしてください" };

  const slots: ScheduleSlot[] = todayTasks
    .filter((t) => t.scheduledSlot)
    .map((t) => {
      const { start, end } = t.scheduledSlot!;
      const deadline = timeToMinutes(t.deadline);
      return { task: t, start, end, late: deadline !== null && end > deadline };
    })
    .sort((a, b) => a.start - b.start || a.task.createdAt - b.task.createdAt);

  return {
    ok: true,
    slots,
    overflow: todayTasks.filter((t) => !t.completed && !t.scheduledSlot),
    availableMinutes: dayEnd - dayStart,
    totalMinutes: todayTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0),
  };
}

export type SlotStatus =
  | { kind: "done"; at?: string }
  | { kind: "late"; minutes: number }
  | { kind: "doing" }
  | { kind: "planned" }
  | { kind: "unscheduled" };

/** 予定時間と現在時刻からタスクの状態を判定する */
export function slotStatus(task: Task, nowMinutes: number): SlotStatus {
  if (task.completed) {
    const at = task.completedAt ? new Date(task.completedAt) : null;
    return { kind: "done", at: at && !Number.isNaN(at.getTime()) ? minutesToTime(at.getHours() * 60 + at.getMinutes()) : undefined };
  }
  const slot = task.scheduledSlot;
  if (!slot) return { kind: "unscheduled" };
  if (nowMinutes > slot.end) return { kind: "late", minutes: nowMinutes - slot.end };
  if (nowMinutes >= slot.start) return { kind: "doing" };
  return { kind: "planned" };
}
