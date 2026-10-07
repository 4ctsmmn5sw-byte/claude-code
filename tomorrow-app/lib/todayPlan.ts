import { minutesToTime, timeToMinutes } from "./date";
import { buildSchedule, roundUpToFiveMinutes, type Schedule, type ScheduleSlot } from "./schedule";
import type { DaySettings, Task } from "./types";

type Slot = { start: number; end: number };

/** 今日の画面に出るタスク: 今日の予定 + 過ぎた日の未完了 */
export function isTodayTask(task: Task, todayKey: string): boolean {
  return task.targetDate === todayKey || (task.targetDate < todayKey && !task.completed);
}

/**
 * dateKey の日の予定時間。scheduledSlot.date がその日のときだけ有効。
 * date のない旧データは「targetDate の日の予定」とみなす（旧版は今日の画面のタスクにだけ付けていた）。
 */
export function slotFor(task: Task, dateKey: string): Slot | undefined {
  const slot = task.scheduledSlot;
  if (!slot) return undefined;
  const date = slot.date ?? task.targetDate;
  return date === dateKey ? { start: slot.start, end: slot.end } : undefined;
}

const overlaps = (a: Slot, b: Slot) => a.start < b.end && b.start < a.end;
const sameSlot = (task: Task, slot: Slot, dateKey: string) =>
  task.scheduledSlot?.start === slot.start && task.scheduledSlot.end === slot.end && task.scheduledSlot.date === dateKey;

function withSlot(task: Task, slot: Slot | undefined, dateKey: string): Task {
  const next = { ...task };
  if (slot) next.scheduledSlot = { start: slot.start, end: slot.end, date: dateKey };
  else delete next.scheduledSlot;
  return next;
}

function settingsValid(settings: DaySettings): boolean {
  const start = timeToMinutes(settings.dayStart);
  const end = timeToMinutes(settings.dayEnd);
  return start !== null && end !== null && end > start;
}

/**
 * 明日のスケジュール（buildSchedule の結果そのまま）を、明日のタスクの scheduledSlot に保存する。
 * 明日のタスクや活動時間が変わるたびに呼ばれ、常に明日の画面の表示と一致させる。
 * 変更がなければ同じ配列を返す。
 */
export function syncTomorrowSlots(tasks: Task[], tomorrowKey: string, settings: DaySettings): Task[] {
  const schedule = buildSchedule(
    tasks.filter((t) => t.targetDate === tomorrowKey),
    settings,
  );
  if (!schedule.ok) return tasks; // 活動時間が不正な間は保存済みの予定を残す
  const slotById = new Map(schedule.slots.map((s) => [s.task.id, { start: s.start, end: s.end }]));

  let changed = false;
  const next = tasks.map((t) => {
    if (t.targetDate !== tomorrowKey) return t;
    const slot = slotById.get(t.id);
    if (slot ? sameSlot(t, slot, tomorrowKey) : !t.scheduledSlot) return t;
    changed = true;
    return withSlot(t, slot, tomorrowKey);
  });
  return changed ? next : tasks;
}

/** fixed の枠を避けて、toPlace を現在時刻以降に割り当てる */
function place(toPlace: Task[], fixed: ScheduleSlot[], settings: DaySettings, nowMinutes: number): Map<string, Slot> {
  const schedule = buildSchedule(toPlace, settings, { from: roundUpToFiveMinutes(nowMinutes), fixed });
  const ids = new Set(toPlace.map((t) => t.id));
  const placed = new Map<string, Slot>();
  if (schedule.ok) {
    for (const s of schedule.slots) if (ids.has(s.task.id)) placed.set(s.task.id, { start: s.start, end: s.end });
  }
  return placed;
}

/**
 * 今日の予定時間を整える。前夜に保存された予定（明日のスケジュール）はそのまま使い、
 * 開いた時刻によって動かさない。変更するのは次の場合だけ。
 * - 所要時間が変わった未完了タスク: 開始はそのままで終了を合わせる。他と重なる／終了時刻を超えるなら置き直し
 * - 今日の予定時間がない未完了タスク（前夜に入りきらなかった・今日追加した・今日に戻した・過ぎた日の残り）:
 *   現在時刻以降の空き時間に割り当てる（入らなければ予定なし）
 * 変更がなければ同じ配列を返す。
 */
export function fillTodaySlots(tasks: Task[], todayKey: string, settings: DaySettings, nowMinutes: number): Task[] {
  if (!settingsValid(settings)) return tasks;
  const dayEnd = timeToMinutes(settings.dayEnd)!;
  let changed = false;

  let next = tasks.map((t, _, all) => {
    if (!isTodayTask(t, todayKey) || t.completed) return t;
    const slot = slotFor(t, todayKey);
    if (!slot || slot.end - slot.start === t.estimatedMinutes) return t;
    const resized = { start: slot.start, end: slot.start + t.estimatedMinutes };
    const conflict =
      resized.end > dayEnd ||
      all.some((o) => {
        const other = o.id !== t.id && isTodayTask(o, todayKey) ? slotFor(o, todayKey) : undefined;
        return other !== undefined && overlaps(other, resized);
      });
    changed = true;
    return withSlot(t, conflict ? undefined : resized, todayKey);
  });

  const today = next.filter((t) => isTodayTask(t, todayKey));
  const toPlace = today.filter((t) => !t.completed && !slotFor(t, todayKey));
  if (toPlace.length > 0) {
    const fixed: ScheduleSlot[] = today.flatMap((t) => {
      const slot = slotFor(t, todayKey);
      return slot ? [{ task: t, ...slot, late: false }] : [];
    });
    const placed = place(toPlace, fixed, settings, nowMinutes);
    const ids = new Set(toPlace.map((t) => t.id));
    next = next.map((t) => {
      if (!ids.has(t.id)) return t;
      const slot = placed.get(t.id);
      // 入りきらないタスクに別の日の予定が残っていれば消す
      if (!slot && !t.scheduledSlot) return t;
      changed = true;
      return withSlot(t, slot, todayKey);
    });
  }
  return changed ? next : tasks;
}

/** 「今から組み直す」: 完了済みの予定は固定し、未完了タスクを現在時刻以降に並べ直す */
export function replanToday(tasks: Task[], todayKey: string, settings: DaySettings, nowMinutes: number): Task[] {
  if (!settingsValid(settings)) return tasks;
  const cleared = tasks.map((t) =>
    isTodayTask(t, todayKey) && !t.completed && t.scheduledSlot ? withSlot(t, undefined, todayKey) : t,
  );
  return fillTodaySlots(cleared, todayKey, settings, nowMinutes);
}

/** 保存済みの予定時間から今日のスケジュールを組み立てる（時間の経過では動かない） */
export function todayScheduleFromSlots(todayTasks: Task[], todayKey: string, settings: DaySettings): Schedule {
  const dayStart = timeToMinutes(settings.dayStart);
  const dayEnd = timeToMinutes(settings.dayEnd);
  if (dayStart === null || dayEnd === null) return { ok: false, error: "開始時刻と終了時刻を入力してください" };
  if (dayEnd <= dayStart) return { ok: false, error: "終了時刻は開始時刻より後にしてください" };

  const slots: ScheduleSlot[] = todayTasks
    .flatMap((t) => {
      const slot = slotFor(t, todayKey);
      if (!slot) return [];
      const deadline = timeToMinutes(t.deadline);
      return [{ task: t, ...slot, late: deadline !== null && slot.end > deadline }];
    })
    .sort((a, b) => a.start - b.start || a.task.createdAt - b.task.createdAt);

  return {
    ok: true,
    slots,
    overflow: todayTasks.filter((t) => !t.completed && !slotFor(t, todayKey)),
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

/** 今日の予定時間と現在時刻からタスクの状態を判定する */
export function slotStatus(task: Task, todayKey: string, nowMinutes: number): SlotStatus {
  if (task.completed) {
    const at = task.completedAt ? new Date(task.completedAt) : null;
    return { kind: "done", at: at && !Number.isNaN(at.getTime()) ? minutesToTime(at.getHours() * 60 + at.getMinutes()) : undefined };
  }
  const slot = slotFor(task, todayKey);
  if (!slot) return { kind: "unscheduled" };
  if (nowMinutes > slot.end) return { kind: "late", minutes: nowMinutes - slot.end };
  if (nowMinutes >= slot.start) return { kind: "doing" };
  return { kind: "planned" };
}
