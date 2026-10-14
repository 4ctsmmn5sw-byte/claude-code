"use client";

import type { RefObject } from "react";
import { fixedColor, taskColor } from "@/lib/colors";
import type { PlacementCheck } from "@/lib/schedule";
import { DAY_MINUTES, formatMinutes, minutesToY, PX_PER_MINUTE } from "@/lib/time";
import type { FixedEvent, Task } from "@/lib/types";
import { TimelineTaskBlock } from "./TimelineTaskBlock";

export interface DragPreview {
  taskId: string;
  title: string;
  color: string;
  startMin: number;
  durationMin: number;
  valid: boolean;
  message: string | null;
}

const HOURS = Array.from({ length: 25 }, (_, h) => h);
const HALF_HOURS = Array.from({ length: 24 }, (_, h) => h * 60 + 30);

/**
 * 00:00〜24:00 の縦型タイムライン。
 * bodyRef の要素の上端がちょうど 0:00 になり、高さは 1440 分 × PX_PER_MINUTE。
 * 座標 → 時刻の換算は常にこの要素の getBoundingClientRect() を基準にする。
 */
export function Timeline({
  scrollRef,
  bodyRef,
  tasks,
  fixedEvents,
  conflictIds,
  preview,
  draggingTaskId,
  nowMin,
  snapMinutes,
  onOpenTask,
  onToggleDone,
  onResize,
  validate,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  tasks: (Task & { startMin: number })[];
  fixedEvents: FixedEvent[];
  conflictIds: Set<string>;
  preview: DragPreview | null;
  draggingTaskId: string | null;
  nowMin: number | null;
  snapMinutes: number;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onResize: (id: string, durationMin: number) => void;
  validate: (id: string, startMin: number, endMin: number) => PlacementCheck;
}) {
  const height = DAY_MINUTES * PX_PER_MINUTE;

  return (
    <div
      ref={scrollRef}
      data-testid="timeline-scroll"
      className="relative h-full overflow-y-auto overscroll-contain"
    >
      <div className="relative pb-28 pt-3 pl-14 pr-3 sm:pr-5 lg:pb-8">
        <div ref={bodyRef} data-testid="timeline-body" className="relative" style={{ height }}>
          {/* 1 時間ごとの線と時刻ラベル */}
          {HOURS.map((h) => (
            <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: minutesToY(h * 60) }}>
              <div className="border-t border-neutral-200" />
              <span className="absolute -left-14 w-11 -translate-y-1/2 text-right text-[11px] tabular-nums text-neutral-400">
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}
          {/* 30 分ごとの補助線 */}
          {HALF_HOURS.map((m) => (
            <div
              key={m}
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-neutral-100"
              style={{ top: minutesToY(m) }}
            />
          ))}

          {/* 固定予定（ドラッグ不可） */}
          {fixedEvents.map((e) => (
            <FixedEventBlock key={e.id} event={e} />
          ))}

          {/* 配置済みタスク */}
          {tasks.map((t) => (
            <TimelineTaskBlock
              key={t.id}
              task={t}
              conflict={conflictIds.has(t.id)}
              dimmed={draggingTaskId === t.id}
              snapMinutes={snapMinutes}
              bodyRef={bodyRef}
              onOpen={() => onOpenTask(t.id)}
              onToggleDone={() => onToggleDone(t.id)}
              onResize={(d) => onResize(t.id, d)}
              validate={(s, e) => validate(t.id, s, e)}
            />
          ))}

          {/* ドラッグ中の配置プレビュー（離した位置にそのまま保存される） */}
          {preview && <PreviewBlock preview={preview} />}

          {/* 現在時刻 */}
          {nowMin !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
              style={{ top: minutesToY(nowMin) }}
              aria-label={`現在時刻 ${formatMinutes(nowMin)}`}
            >
              <span className="-ml-1.5 size-2.5 rounded-full bg-rose-500" />
              <span className="h-px flex-1 bg-rose-500" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FixedEventBlock({ event }: { event: FixedEvent }) {
  const c = fixedColor(event.color);
  const h = minutesToY(event.endMin - event.startMin);
  return (
    <div
      data-testid="fixed-event"
      data-start={event.startMin}
      data-end={event.endMin}
      className="absolute inset-x-0 z-10 cursor-not-allowed select-none overflow-hidden rounded-lg"
      style={{
        top: minutesToY(event.startMin),
        height: h,
        color: c.text,
        backgroundColor: c.bg,
        backgroundImage: `repeating-linear-gradient(135deg, transparent 0 7px, ${c.accent}14 7px 14px)`,
        boxShadow: `inset 3px 0 0 ${c.accent}`,
      }}
      title={`固定予定：${event.title}（設定画面で変更できます）`}
    >
      <div className={`flex gap-x-2 px-3 ${h < 30 ? "items-center py-0 h-full" : "flex-col py-1.5"}`}>
        <span className="flex items-center gap-1 truncate text-xs font-semibold">
          <LockIcon />
          {event.title}
        </span>
        <span className="text-[11px] tabular-nums opacity-70">
          {formatMinutes(event.startMin)}–{formatMinutes(event.endMin)}
        </span>
      </div>
    </div>
  );
}

function PreviewBlock({ preview }: { preview: DragPreview }) {
  const c = taskColor(preview.color);
  return (
    <div
      data-testid="drag-preview"
      data-start={preview.startMin}
      className={`pointer-events-none absolute inset-x-0 z-40 rounded-lg border-2 border-dashed ${
        preview.valid ? "" : "border-rose-500 bg-rose-50/80"
      }`}
      style={{
        top: minutesToY(preview.startMin),
        height: Math.max(minutesToY(preview.durationMin), 6),
        ...(preview.valid ? { borderColor: c.accent, backgroundColor: `${c.bg}e6` } : {}),
      }}
    >
      <div className="absolute -top-6 left-0 rounded-md bg-neutral-900 px-2 py-0.5 text-xs font-medium tabular-nums text-white shadow">
        {formatMinutes(preview.startMin)}–{formatMinutes(preview.startMin + preview.durationMin)}
      </div>
      {!preview.valid && preview.message && (
        <div className="absolute left-2 top-1 right-2 truncate text-xs font-medium text-rose-700">{preview.message}</div>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3 shrink-0 opacity-70" fill="currentColor" aria-label="固定">
      <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
    </svg>
  );
}
