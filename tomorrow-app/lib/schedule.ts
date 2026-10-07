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
      slots: ScheduleSlot[];
      /** 活動時間内に入りきらなかったタスク */
      overflow: Task[];
      availableMinutes: number;
      totalMinutes: number;
    };

const deadlineOf = (t: Task) => timeToMinutes(t.deadline);

/** 時刻 from から、締切のあるタスクを締切順に詰めたとき全て間に合うか */
function deadlinesFeasible(tasks: Task[], from: number): boolean {
  let cursor = from;
  const withDeadline = tasks
    .filter((t) => deadlineOf(t) !== null)
    .sort((a, b) => deadlineOf(a)! - deadlineOf(b)!);
  for (const t of withDeadline) {
    if (cursor + t.estimatedMinutes > deadlineOf(t)!) return false;
    cursor += t.estimatedMinutes + BREAK_MINUTES;
  }
  return true;
}

/**
 * ルールベースで明日の実行時間を割り当てる。
 * 1. 開始時刻から順に、休憩を挟んでタスクを並べる
 * 2. 次に置くタスクはおすすめ度（締切・重要度・所要時間）の高い順に選ぶ
 * 3. ただし、それを先に置くと締切のある他タスクが間に合わなくなる場合は飛ばす
 * 4. どれを選んでも間に合わない場合は、締切の早いものを優先する
 * 5. 終了時刻までに収まらないタスクは overflow に回す
 * 完了済みタスクも枠を確保したまま扱い、途中で完了しても予定がずれないようにする。
 */
export function buildSchedule(tasks: Task[], settings: DaySettings): Schedule {
  const dayStart = timeToMinutes(settings.dayStart);
  const dayEnd = timeToMinutes(settings.dayEnd);
  if (dayStart === null || dayEnd === null) {
    return { ok: false, error: "開始時刻と終了時刻を入力してください" };
  }
  if (dayEnd <= dayStart) {
    return { ok: false, error: "終了時刻は開始時刻より後にしてください" };
  }

  const remaining = [...tasks].sort(
    (a, b) => recommendScore(b) - recommendScore(a) || a.createdAt - b.createdAt,
  );
  const slots: ScheduleSlot[] = [];
  let cursor = dayStart;

  while (remaining.length > 0) {
    const fits = remaining.filter((t) => cursor + t.estimatedMinutes <= dayEnd);
    if (fits.length === 0) break;

    const pick =
      fits.find((t) =>
        deadlinesFeasible(
          remaining.filter((r) => r !== t),
          cursor + t.estimatedMinutes + BREAK_MINUTES,
        ),
      ) ??
      // 締切の衝突が避けられない場合: 締切の早いもの → おすすめ順
      [...fits].sort((a, b) => (deadlineOf(a) ?? Infinity) - (deadlineOf(b) ?? Infinity))[0];

    const end = cursor + pick.estimatedMinutes;
    const deadline = deadlineOf(pick);
    slots.push({ task: pick, start: cursor, end, late: deadline !== null && end > deadline });
    remaining.splice(remaining.indexOf(pick), 1);
    cursor = end + BREAK_MINUTES;
  }

  return {
    ok: true,
    slots,
    overflow: remaining,
    availableMinutes: dayEnd - dayStart,
    totalMinutes: tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0),
  };
}
