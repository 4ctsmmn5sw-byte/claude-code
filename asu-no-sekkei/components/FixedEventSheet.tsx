"use client";

import { formatDateLabel } from "@/lib/date";
import { formatMinutes } from "@/lib/time";
import type { DateKey, FixedEvent } from "@/lib/types";
import { Modal } from "./Modal";

/**
 * 固定予定をタップしたときの選択肢。
 * 「この日だけ休み」は例外日として記録するだけで、毎週の設定そのものは変えない。
 */
export function FixedEventSheet({
  event,
  date,
  skipped,
  onSkip,
  onUnskip,
  onEditWeekly,
  onClose,
}: {
  event: FixedEvent;
  date: DateKey;
  skipped: boolean;
  onSkip: () => void;
  onUnskip: () => void;
  onEditWeekly: () => void;
  onClose: () => void;
}) {
  const btn = "flex h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-medium active:bg-neutral-100";
  return (
    <Modal title={event.title} onClose={onClose} testId="fixed-sheet">
      <p className="mb-3 flex items-center gap-1.5 text-sm tabular-nums text-neutral-500">
        <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
          <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
        </svg>
        毎週の固定予定 ・ {formatMinutes(event.startMin)}–{formatMinutes(event.endMin)}
      </p>
      <div className="flex flex-col gap-1 rounded-2xl bg-neutral-50 p-1">
        {skipped ? (
          <button type="button" className={btn} onClick={onUnskip}>
            {formatDateLabel(date)}の休みを取り消す
          </button>
        ) : (
          <button type="button" className={btn} onClick={onSkip}>
            この日だけ休みにする
            <span className="ml-auto text-xs font-normal text-neutral-400">{formatDateLabel(date)}</span>
          </button>
        )}
        <button type="button" className={btn} onClick={onEditWeekly}>
          毎週の予定を編集する
          <span className="ml-auto text-xs font-normal text-neutral-400">すべての週に反映</span>
        </button>
      </div>
      <button type="button" className="mt-3 h-12 w-full rounded-2xl text-[15px] text-neutral-600 active:bg-neutral-100" onClick={onClose}>
        キャンセル
      </button>
    </Modal>
  );
}
