import { timeToMinutes } from "./date";
import { recommendScore } from "./sort";
import type { DaySettings, Task } from "./types";

/** タスク間の休憩（分） */
export const BREAK_MINUTES = 10;

export interface ScheduleSlot {
  task: Task;
  /** 0:00 からの分数 */
  start: number;
  end: number;
  /** 締切に間に合わない */
  late: boolean;
}

export type Schedule =
  | { ok: false; error: string }
  | {
      ok: true;
      /** 開始時刻順 */
      slots: ScheduleSlot[];
      /** 活動時間内に入りきらなかったタスク */
      overflow: Task[];
      availableMinutes: number;
      totalMinutes: number;
    };

interface Options {
  /** この時刻より前には配置しない（今日のスケジュールで現在時刻を渡す） */
  from?: number;
  /** 位置を固定する枠（完了済みタスク）。他のタスクはこの時間帯を避けて配置する */
  fixed?: ScheduleSlot[];
}

const deadlineOf = (t: Task) => timeToMinutes(t.deadline);

interface Interval {
  start: number;
  end: number;
}

/** cursor 以降で、固定枠と重ならずに duration 分を置ける最初の開始時刻 */
function placeAt(cursor: number, duration: number, blocked: Interval[]): number {
  let start = cursor;
  for (const b of blocked) {
    if (start + duration <= b.start) break;
    if (start < b.end + BREAK_MINUTES) start = b.end + BREAK_MINUTES;
  }
  return start;
}

/** 時刻 from から、締切のあるタスクを締切順に詰めたとき全て間に合うか */
function deadlinesFeasible(tasks: Task[], from: number, blocked: Interval[]): boolean {
  let cursor = from;
  const withDeadline = tasks
    .filter((t) => deadlineOf(t) !== null)
    .sort((a, b) => deadlineOf(a)! - deadlineOf(b)!);
  for (const t of withDeadline) {
    const end = placeAt(cursor, t.estimatedMinutes, blocked) + t.estimatedMinutes;
    if (end > deadlineOf(t)!) return false;
    cursor = end + BREAK_MINUTES;
  }
  return true;
}

/**
 * ルールベースで実行時間を割り当てる。
 * 1. 開始時刻（from があればそれ以降）から順に、休憩を挟んでタスクを並べる
 * 2. 次に置くタスクはおすすめ度（締切・重要度・所要時間）の高い順に選ぶ
 * 3. ただし、それを先に置くと締切のある他タスクが間に合わなくなる場合は飛ばす
 * 4. どれを選んでも間に合わない場合は、締切の早いものを優先する
 * 5. 終了時刻までに収まらないタスクは overflow に回す
 * fixed の枠は動かさず、その時間帯は避けて配置する。
 */
export function buildSchedule(tasks: Task[], settings: DaySettings, options: Options = {}): Schedule {
  const dayStart = timeToMinutes(settings.dayStart);
  const dayEnd = timeToMinutes(settings.dayEnd);
  if (dayStart === null || dayEnd === null) {
    return { ok: false, error: "開始時刻と終了時刻を入力してください" };
  }
  if (dayEnd <= dayStart) {
    return { ok: false, error: "終了時刻は開始時刻より後にしてください" };
  }

  const fixed = options.fixed ?? [];
  const blocked = fixed.map(({ start, end }) => ({ start, end })).sort((a, b) => a.start - b.start);
  const remaining = [...tasks].sort(
    (a, b) => recommendScore(b) - recommendScore(a) || a.createdAt - b.createdAt,
  );
  const slots: ScheduleSlot[] = [...fixed];
  let cursor = Math.max(dayStart, options.from ?? dayStart);

  while (remaining.length > 0) {
    const fits = remaining.filter((t) => placeAt(cursor, t.estimatedMinutes, blocked) + t.estimatedMinutes <= dayEnd);
    if (fits.length === 0) break;

    const pick =
      fits.find((t) => {
        const end = placeAt(cursor, t.estimatedMinutes, blocked) + t.estimatedMinutes;
        return deadlinesFeasible(
          remaining.filter((r) => r !== t),
          end + BREAK_MINUTES,
          blocked,
        );
      }) ??
      // 締切の衝突が避けられない場合: 締切の早いもの → おすすめ順
      [...fits].sort((a, b) => (deadlineOf(a) ?? Infinity) - (deadlineOf(b) ?? Infinity))[0];

    const start = placeAt(cursor, pick.estimatedMinutes, blocked);
    const end = start + pick.estimatedMinutes;
    const deadline = deadlineOf(pick);
    slots.push({ task: pick, start, end, late: deadline !== null && end > deadline });
    remaining.splice(remaining.indexOf(pick), 1);
    cursor = end + BREAK_MINUTES;
  }

  return {
    ok: true,
    slots: slots.sort((a, b) => a.start - b.start),
    overflow: remaining,
    availableMinutes: dayEnd - dayStart,
    totalMinutes: [...tasks, ...fixed.map((s) => s.task)].reduce((sum, t) => sum + t.estimatedMinutes, 0),
  };
}

/** 現在時刻を5分単位で切り上げ */
export function roundUpToFiveMinutes(minutes: number): number {
  return Math.ceil(minutes / 5) * 5;
}
