import { addDays } from "./date";
import { checkPlacement } from "./schedule";
import { DEFAULT_SLOT_OPTIONS, type SlotOptions } from "./slots";
import type { DateKey, FixedEvent, GoalStep, Task, WorkLog } from "./types";

/**
 * 工程の「総必要時間」と「1 回の作業時間」を分けて扱うための計算（AI を使わない決まった計算）。
 * - 工程の estimatedMinutes は総必要時間（推定）。タスクを作っても変えない
 * - タスクの durationMin は 1 回分の予定時間
 * - 実績は WorkLog（タスク完了時に taskId 付きで 1 件だけ記録。完了を取り消すと消える）
 */

/** 1 回の作業時間の選択肢と初期値 */
export const SESSION_CHOICES = [30, 45, 60, 90] as const;
export const DEFAULT_SESSION_MINUTES = 60;
/** これより短い端数は、独立した 1 回にせず最後の回に足す */
export const MIN_SESSION_MINUTES = 15;
/** 空き時間に合わせて短くするときの候補（長い順） */
export const ADAPT_SESSION_CHOICES = [90, 60, 45, 30] as const;

export interface StepProgress {
  /** 総必要時間（推定）。未設定なら null */
  estimatedMinutes: number | null;
  /** 記録済みの実績 */
  actualMinutes: number;
  /** 残り必要時間 = 推定総時間 − 実績（0 未満にしない）。推定がなければ null */
  remainingMinutes: number | null;
  /** 未完了のタスクとして予定済みの時間（配置済み＋未配置） */
  plannedMinutes: number;
  /** そのうち配置済み */
  placedMinutes: number;
  /** 残り必要時間のうち、まだ予定に入れていない時間 */
  unplannedMinutes: number | null;
  /** 予定が残り必要時間を超えている分 */
  overPlannedMinutes: number;
}

export function stepProgress(step: Pick<GoalStep, "id" | "estimatedMinutes">, tasks: Task[], logs: WorkLog[]): StepProgress {
  const actual = logs.filter((l) => l.stepId === step.id).reduce((s, l) => s + l.minutes, 0);
  // 完了したタスクは実績（WorkLog）に入るので、予定には数えない（二重計上しない）
  const open = tasks.filter((t) => t.stepId === step.id && !t.done);
  const planned = open.reduce((s, t) => s + t.durationMin, 0);
  const placed = open.filter((t) => t.date !== null && t.startMin !== null).reduce((s, t) => s + t.durationMin, 0);
  const est = step.estimatedMinutes;
  const remaining = est === null ? null : Math.max(0, est - actual);
  return {
    estimatedMinutes: est,
    actualMinutes: actual,
    remainingMinutes: remaining,
    plannedMinutes: planned,
    placedMinutes: placed,
    unplannedMinutes: remaining === null ? null : Math.max(0, remaining - planned),
    overPlannedMinutes: remaining === null ? 0 : Math.max(0, planned - remaining),
  };
}

/**
 * 時間を 1 回の作業時間ごとに分ける。例：300 分を 60 分ずつ → 60×5。
 * 端数：MIN_SESSION_MINUTES 以上なら最後に 1 回足す（280 分 → 60×4 + 40）。
 * それより短ければ最後の回に足す（305 分 → 60×4 + 65）。5 分単位に切り上げる。
 */
export function splitSessions(totalMinutes: number, sessionMinutes: number): number[] {
  if (!(totalMinutes > 0) || !(sessionMinutes > 0)) return [];
  const total = Math.ceil(totalMinutes / 5) * 5;
  const n = Math.floor(total / sessionMinutes);
  const rest = total - n * sessionMinutes;
  const out = Array.from({ length: n }, () => sessionMinutes);
  if (rest === 0) return out;
  if (rest >= MIN_SESSION_MINUTES || out.length === 0) out.push(Math.max(5, rest));
  else out[out.length - 1] += rest;
  return out;
}

export interface SessionCandidate {
  date: DateKey;
  startMin: number;
  durationMin: number;
}

/**
 * 分割した各回を、startDate から 1 日 1 回ずつ、その日の最も早い空き時間に配置する候補を作る（保存はしない）。
 * - 固定予定・既存のタスク・先に決めた候補と重ならない
 * - 空きがない日は飛ばす（maxDays 日まで探す）
 * - adapt が true なら、その日に入らない回は 45 分・30 分などに短くして入れ、足りない分は次の回に回す
 * 置けなかった時間は unplacedMinutes に返す。
 */
export function proposeSessions(input: {
  tasks: Task[];
  events: FixedEvent[];
  startDate: DateKey;
  sessions: number[];
  adapt?: boolean;
  maxDays?: number;
  opts?: SlotOptions;
}): { candidates: SessionCandidate[]; unplacedMinutes: number } {
  const opts = input.opts ?? DEFAULT_SLOT_OPTIONS;
  const maxDays = input.maxDays ?? 30;
  const queue = [...input.sessions];
  const candidates: SessionCandidate[] = [];
  // 候補どうしも重ならないよう、仮のタスクとして足しながら探す
  const work: Task[] = [...input.tasks];
  let day = 0;
  while (queue.length > 0 && day < maxDays) {
    const date = addDays(input.startDate, day);
    const want = queue[0];
    let placed: SessionCandidate | null = null;
    const lengths = input.adapt ? [want, ...ADAPT_SESSION_CHOICES.filter((c) => c < want)] : [want];
    for (const len of lengths) {
      const start = earliestStart(work, input.events, date, len, opts);
      if (start !== null) {
        placed = { date, startMin: start, durationMin: len };
        break;
      }
    }
    if (placed) {
      candidates.push(placed);
      work.push(phantom(placed, candidates.length));
      queue.shift();
      const shortfall = want - placed.durationMin;
      // 短くした分は次の回に回す（なければ新しい回として最後に足す）
      if (shortfall > 0) {
        if (queue.length > 0) queue[queue.length - 1] += shortfall;
        else queue.push(shortfall);
      }
    }
    day++;
  }
  return { candidates, unplacedMinutes: queue.reduce((s, m) => s + m, 0) };
}

function earliestStart(tasks: Task[], events: FixedEvent[], date: DateKey, len: number, opts: SlotOptions): number | null {
  for (let start = Math.ceil(opts.from / opts.step) * opts.step; start + len <= opts.to; start += opts.step) {
    if (checkPlacement(tasks, events, date, "__candidate__", start, start + len).ok) return start;
  }
  return null;
}

function phantom(c: SessionCandidate, i: number): Task {
  return {
    id: `__candidate-${i}__`,
    title: "候補",
    durationMin: c.durationMin,
    color: "violet",
    done: false,
    date: c.date,
    startMin: c.startMin,
    createdAt: "",
    updatedAt: "",
  };
}

/** 前提の工程の未完了タスクのうち、最も遅い配置日（その翌日以降に始めると順番を守れる） */
export function latestPrerequisiteDate(step: GoalStep, tasks: Task[]): DateKey | null {
  const dates = tasks
    .filter((t) => !t.done && t.stepId && step.dependsOn.includes(t.stepId) && t.date !== null)
    .map((t) => t.date as DateKey)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}
