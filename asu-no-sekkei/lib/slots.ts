import { checkPlacement } from "./schedule";
import type { DateKey, FixedEvent, Task } from "./types";

/**
 * 空き時間の検索（AI を使わない、決まった計算）。
 * 固定予定（休みの日を除く）と配置済みタスクに重ならない、最も早い開始時刻を探す。
 */
export interface SlotOptions {
  /** 探し始める時刻（分） */
  from: number;
  /** この時刻までに終わること（分） */
  to: number;
  /** 開始時刻の刻み（分） */
  step: number;
}

export const DEFAULT_SLOT_OPTIONS: SlotOptions = { from: 8 * 60, to: 22 * 60, step: 5 };

export function findFreeSlot(
  tasks: Task[],
  events: FixedEvent[],
  date: DateKey,
  taskId: string,
  durationMin: number,
  opts: SlotOptions = DEFAULT_SLOT_OPTIONS,
): number | null {
  for (let start = Math.ceil(opts.from / opts.step) * opts.step; start + durationMin <= opts.to; start += opts.step) {
    if (checkPlacement(tasks, events, date, taskId, start, start + durationMin).ok) return start;
  }
  return null;
}
