"use client";

import type { RefObject } from "react";
import { fixedColor, taskColor } from "@/lib/colors";
import type { PlacementCheck } from "@/lib/schedule";
import { DAY_MINUTES, formatMinutes } from "@/lib/time";
import type { FixedEvent, Task } from "@/lib/types";
import { MIN_HIT, TimelineTaskBlock } from "./TimelineTaskBlock";

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
const QUARTERS = Array.from({ length: 48 }, (_, i) => i * 30 + 15);

/** 時刻ラベルの左余白（px） */
export const LABEL_WIDTH = 52;

/**
 * 00:00〜24:00 の縦型タイムライン。
 * bodyRef の要素の上端がちょうど 0:00 になり、高さは 1440 分 × ppm（表示倍率）。
 * 座標 → 時刻の換算は常にこの要素の getBoundingClientRect() を基準にするので、
 * スクロール量・倍率・画面サイズが変わっても対応がずれない。
 */
export function Timeline({
  scrollRef,
  bodyRef,
  ppm,
  bottomPad,
  tasks,
  fixedEvents,
  skippedFixed,
  conflictIds,
  preview,
  draggingTaskId,
  selectedTaskId,
  placing,
  nowMin,
  snapMinutes,
  onTapTask,
  onTapFixed,
  onTapBackground,
  onResize,
  validate,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  ppm: number;
  /** 下部シートに隠れる分の余白（px） */
  bottomPad: number;
  tasks: (Task & { startMin: number })[];
  fixedEvents: FixedEvent[];
  skippedFixed: FixedEvent[];
  conflictIds: Set<string>;
  preview: DragPreview | null;
  draggingTaskId: string | null;
  selectedTaskId: string | null;
  placing: boolean;
  nowMin: number | null;
  snapMinutes: number;
  onTapTask: (id: string) => void;
  onTapFixed: (event: FixedEvent, skipped: boolean) => void;
  onTapBackground: (clientY: number) => void;
  onResize: (id: string, durationMin: number) => void;
  validate: (id: string, startMin: number, endMin: number) => PlacementCheck;
}) {
  const height = DAY_MINUTES * ppm;
  const showHalfLabels = ppm >= 2;
  const showQuarters = ppm >= 3;

  return (
    <div
      ref={scrollRef}
      data-testid="timeline-scroll"
      className="absolute inset-0 overflow-y-auto overscroll-contain"
    >
      <div className="relative pt-4 pr-3" style={{ paddingLeft: LABEL_WIDTH, paddingBottom: bottomPad + 24 }}>
        <div
          ref={bodyRef}
          data-testid="timeline-body"
          data-ppm={ppm}
          className={`relative ${placing ? "cursor-copy" : ""}`}
          style={{ height }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (!placing && target.closest("[data-testid=task-block],[data-testid=fixed-event]")) return;
            onTapBackground(e.clientY);
          }}
        >
          {HOURS.map((h) => (
            <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: h * 60 * ppm }}>
              <div className="border-t border-neutral-200" />
              <span
                className="absolute -translate-y-1/2 text-right text-[11px] font-medium tabular-nums text-neutral-400"
                style={{ left: -LABEL_WIDTH, width: LABEL_WIDTH - 10 }}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}
          {HALF_HOURS.map((m) => (
            <div key={m} className="pointer-events-none absolute inset-x-0" style={{ top: m * ppm }}>
              <div className="border-t border-dashed border-neutral-200/70" />
              {showHalfLabels && (
                <span
                  className="absolute -translate-y-1/2 text-right text-[10px] tabular-nums text-neutral-300"
                  style={{ left: -LABEL_WIDTH, width: LABEL_WIDTH - 10 }}
                >
                  :30
                </span>
              )}
            </div>
          ))}
          {showQuarters &&
            QUARTERS.map((m) => (
              <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-dotted border-neutral-100" style={{ top: m * ppm }} />
            ))}

          {skippedFixed.map((e) => (
            <SkippedFixedBlock key={e.id} event={e} ppm={ppm} inert={placing} onTap={() => onTapFixed(e, true)} />
          ))}
          {fixedEvents.map((e) => (
            <FixedEventBlock key={e.id} event={e} ppm={ppm} inert={placing} onTap={() => onTapFixed(e, false)} />
          ))}

          {tasks.map((t) => (
            <TimelineTaskBlock
              key={t.id}
              task={t}
              ppm={ppm}
              selected={selectedTaskId === t.id}
              conflict={conflictIds.has(t.id)}
              dimmed={draggingTaskId === t.id}
              inert={placing}
              snapMinutes={snapMinutes}
              bodyRef={bodyRef}
              onTap={() => onTapTask(t.id)}
              onResize={(d) => onResize(t.id, d)}
              validate={(s, e) => validate(t.id, s, e)}
            />
          ))}

          {preview && <PreviewBlock preview={preview} ppm={ppm} />}

          {nowMin !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
              style={{ top: nowMin * ppm }}
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

function FixedEventBlock({ event, ppm, inert, onTap }: { event: FixedEvent; ppm: number; inert: boolean; onTap: () => void }) {
  const c = fixedColor(event.color);
  const h = (event.endMin - event.startMin) * ppm;
  const hit = Math.max(h, MIN_HIT);
  return (
    <div
      data-testid="fixed-event"
      data-start={event.startMin}
      data-end={event.endMin}
      className={`absolute inset-x-0 z-10 select-none ${inert ? "pointer-events-none" : ""}`}
      style={{ top: event.startMin * ppm, height: h }}
    >
      <div
        className="h-full overflow-hidden rounded-lg"
        style={{
          color: c.text,
          backgroundColor: c.bg,
          backgroundImage: `repeating-linear-gradient(135deg, transparent 0 7px, ${c.accent}18 7px 14px)`,
          boxShadow: `inset 3px 0 0 ${c.accent}`,
        }}
      >
        <div className={`flex gap-x-2 px-3 ${h < 34 ? "h-full items-center" : "flex-col py-1.5"}`}>
          <span className="flex items-center gap-1 truncate text-xs font-semibold">
            <LockIcon />
            {event.title}
          </span>
          <span className="text-[11px] tabular-nums opacity-70">
            {formatMinutes(event.startMin)}–{formatMinutes(event.endMin)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onTap}
        onContextMenu={(e) => e.preventDefault()}
        className="no-callout absolute inset-x-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        style={{ top: (h - hit) / 2, height: hit }}
        aria-label={`固定予定 ${event.title} ${formatMinutes(event.startMin)}から${formatMinutes(event.endMin)}（タップで操作を選択）`}
      />
    </div>
  );
}

function SkippedFixedBlock({ event, ppm, inert, onTap }: { event: FixedEvent; ppm: number; inert: boolean; onTap: () => void }) {
  const c = fixedColor(event.color);
  const h = (event.endMin - event.startMin) * ppm;
  return (
    <button
      type="button"
      data-testid="skipped-fixed-event"
      onClick={onTap}
      className={`absolute inset-x-0 z-[5] flex items-start gap-1 rounded-lg border border-dashed px-3 py-1.5 text-left text-xs ${
        inert ? "pointer-events-none" : ""
      }`}
      style={{ top: event.startMin * ppm, height: Math.max(h, 4), borderColor: `${c.accent}66`, color: `${c.text}99` }}
      aria-label={`${event.title}（この日は休み。タップで取り消し）`}
    >
      <span className="truncate line-through">{event.title}</span>
      <span className="shrink-0 rounded bg-neutral-100 px-1 text-[10px] text-neutral-500 no-underline">休み</span>
    </button>
  );
}

function PreviewBlock({ preview, ppm }: { preview: DragPreview; ppm: number }) {
  const c = taskColor(preview.color);
  return (
    <div
      data-testid="drag-preview"
      data-start={preview.startMin}
      data-valid={preview.valid}
      className={`pointer-events-none absolute inset-x-0 z-40 rounded-lg border-2 border-dashed ${
        preview.valid ? "" : "border-rose-500 bg-rose-100/90"
      }`}
      style={{
        top: preview.startMin * ppm,
        height: Math.max(preview.durationMin * ppm, 6),
        ...(preview.valid ? { borderColor: c.accent, backgroundColor: `${c.bg}e6` } : {}),
      }}
    >
      <div
        className={`absolute -top-7 right-0 rounded-md px-2 py-1 text-xs font-semibold tabular-nums text-white shadow ${
          preview.valid ? "bg-neutral-900" : "bg-rose-600"
        }`}
      >
        {formatMinutes(preview.startMin)}–{formatMinutes(preview.startMin + preview.durationMin)}
      </div>
      {!preview.valid && preview.message && preview.durationMin * ppm >= 18 && (
        <div className="absolute inset-x-2 top-1 truncate text-xs font-semibold text-rose-700">{preview.message}</div>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3 shrink-0 opacity-75" fill="currentColor" aria-label="固定">
      <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
    </svg>
  );
}
