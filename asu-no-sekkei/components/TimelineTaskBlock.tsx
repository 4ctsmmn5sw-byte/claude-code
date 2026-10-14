"use client";

import { useDraggable } from "@dnd-kit/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { taskColor } from "@/lib/colors";
import type { PlacementCheck } from "@/lib/schedule";
import { clamp, DAY_MINUTES, formatMinutes, snap } from "@/lib/time";
import type { Task } from "@/lib/types";

export type DragData = { taskId: string; kind: "placed" | "unplaced" };

/** タップ操作の最小の当たり判定（px） */
export const MIN_HIT = 44;

/**
 * タイムライン上の配置済みタスク。
 * - タップ：選択（もう一度タップで編集）。小さいタスクでも当たり判定は高さ 44px を確保する
 * - 長押し後の移動：@dnd-kit/react でドラッグ（時刻の計算は Planner 側でポインタ座標から行う）
 * - 選択中だけ下端に長さ変更ハンドル（Pointer Events。setPointerCapture で指が外れても追従）
 */
export function TimelineTaskBlock({
  task,
  ppm,
  selected,
  conflict,
  dimmed,
  inert,
  snapMinutes,
  bodyRef,
  onTap,
  onResize,
  validate,
}: {
  task: Task & { startMin: number };
  ppm: number;
  selected: boolean;
  conflict: boolean;
  dimmed: boolean;
  /** タップで配置モード中など、タップを背景へ通したいとき */
  inert: boolean;
  snapMinutes: number;
  bodyRef: RefObject<HTMLDivElement | null>;
  onTap: () => void;
  onResize: (durationMin: number) => void;
  validate: (startMin: number, endMin: number) => PlacementCheck;
}) {
  const { ref, handleRef, isDragging } = useDraggable<DragData>({
    id: `placed:${task.id}`,
    data: { taskId: task.id, kind: "placed" },
    disabled: inert,
  });
  const [resizeEnd, setResizeEnd] = useState<number | null>(null);
  const resizing = useRef(false);
  // ドラッグ直後に発生する click で選択・編集が動かないようにする
  const lastDragAt = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    if (isDragging) return () => void (lastDragAt.current = performance.now());
  }, [isDragging]);

  const c = taskColor(task.color);
  const endMin = resizeEnd ?? task.startMin + task.durationMin;
  const duration = endMin - task.startMin;
  const heightPx = duration * ppm;
  const resizeCheck = resizeEnd !== null ? validate(task.startMin, resizeEnd) : null;
  const invalid = conflict || (resizeCheck !== null && !resizeCheck.ok);
  const compact = heightPx < 38;
  const hitHeight = Math.max(heightPx, MIN_HIT);

  const endFromPointer = (clientY: number) => {
    const top = bodyRef.current?.getBoundingClientRect().top ?? 0;
    const raw = snap((clientY - top) / ppm, snapMinutes);
    return clamp(raw, task.startMin + snapMinutes, DAY_MINUTES);
  };

  return (
    <div
      ref={ref}
      data-testid="task-block"
      data-task-id={task.id}
      data-start={task.startMin}
      data-end={endMin}
      data-selected={selected || undefined}
      className={`absolute inset-x-0 transition-opacity ${dimmed ? "opacity-35" : ""} ${selected ? "z-30" : "z-20"} ${
        inert ? "pointer-events-none" : ""
      }`}
      style={{ top: task.startMin * ppm, height: Math.max(heightPx, 4) }}
    >
      {/* 見た目 */}
      <div
        className={`flex h-full overflow-hidden rounded-lg ${invalid ? "ring-2 ring-rose-500" : selected ? "ring-2 ring-neutral-900" : ""}`}
        style={{
          backgroundColor: invalid ? "#fde8ec" : c.bg,
          color: c.text,
          boxShadow: `inset 3px 0 0 ${invalid ? "#e11d48" : c.accent}, 0 1px 2px rgb(0 0 0 / 0.06)`,
        }}
      >
        <div className={`flex min-w-0 flex-1 gap-1.5 pl-3 pr-2 ${compact ? "items-center" : "items-start pt-1.5"} ${task.done ? "opacity-55" : ""}`}>
          {task.done && <CheckIcon color={c.accent} />}
          <div className={`min-w-0 flex-1 ${compact ? "flex items-baseline gap-2" : ""}`}>
            <div className={`truncate font-semibold leading-tight ${compact ? "text-xs" : "text-sm"} ${task.done ? "line-through" : ""}`}>
              {task.title}
            </div>
            {heightPx >= 14 && (
              <div className="truncate text-[11px] tabular-nums opacity-75">
                {formatMinutes(task.startMin)}–{formatMinutes(endMin)}
                {!compact && <span className="ml-1">（{duration}分）</span>}
              </div>
            )}
            {conflict && !compact && <div className="mt-0.5 text-[11px] font-semibold text-rose-600">他の予定と重複しています</div>}
          </div>
        </div>
      </div>

      {/* 当たり判定（小さいタスクでも 44px） */}
      <div
        ref={handleRef}
        role="button"
        tabIndex={0}
        aria-label={`${task.title} ${formatMinutes(task.startMin)}から${formatMinutes(endMin)}${selected ? "（選択中。タップで編集）" : "（タップで選択、長押しで移動）"}`}
        aria-pressed={selected}
        onClick={() => {
          if (performance.now() - lastDragAt.current < 400 || resizing.current) return;
          onTap();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTap();
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="no-callout absolute inset-x-0 cursor-grab touch-manipulation select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 active:cursor-grabbing"
        style={{ top: (heightPx - hitHeight) / 2, height: hitHeight }}
      />

      {/* 長さ変更ハンドル（選択中のみ。当たり判定 44px） */}
      {selected && !inert && (
        <div
          data-testid="resize-handle"
          role="slider"
          aria-label={`${task.title}の終了時刻`}
          aria-valuemin={task.startMin + 1}
          aria-valuemax={DAY_MINUTES}
          aria-valuenow={endMin}
          aria-valuetext={formatMinutes(endMin)}
          tabIndex={-1}
          className="no-callout absolute inset-x-0 z-10 flex cursor-ns-resize touch-none select-none items-center justify-center"
          style={{ top: Math.max(heightPx, 4) - MIN_HIT / 2, height: MIN_HIT }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            resizing.current = true;
            setResizeEnd(endFromPointer(e.clientY));
          }}
          onPointerMove={(e) => {
            if (resizing.current) setResizeEnd(endFromPointer(e.clientY));
          }}
          onPointerUp={(e) => {
            if (!resizing.current) return;
            const end = endFromPointer(e.clientY);
            resizing.current = false;
            setResizeEnd(null);
            if (end !== task.startMin + task.durationMin) onResize(end - task.startMin);
          }}
          onPointerCancel={() => {
            // キャンセル時は元の長さに戻す
            resizing.current = false;
            setResizeEnd(null);
          }}
        >
          <span
            className="flex h-5 w-12 items-center justify-center rounded-full bg-white shadow"
            style={{ boxShadow: `0 0 0 1px ${invalid ? "#e11d48" : c.accent}, 0 1px 3px rgb(0 0 0 / 0.15)` }}
          >
            <span className="h-1 w-6 rounded-full" style={{ backgroundColor: invalid ? "#e11d48" : c.accent }} />
          </span>
        </div>
      )}

      {resizeEnd !== null && (
        <div
          data-testid="resize-label"
          className={`pointer-events-none absolute right-0 z-40 rounded-md px-2 py-1 text-xs font-semibold tabular-nums text-white shadow ${
            resizeCheck && !resizeCheck.ok ? "bg-rose-600" : "bg-neutral-900"
          }`}
          style={{ top: heightPx + 14 }}
        >
          {formatMinutes(task.startMin)}–{formatMinutes(resizeEnd)}（{duration}分）
          {resizeCheck && !resizeCheck.ok && " 重複"}
        </div>
      )}
    </div>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <span className="mt-px grid size-3.5 shrink-0 place-items-center rounded-full" style={{ backgroundColor: color }} aria-label="完了">
      <svg viewBox="0 0 12 12" className="size-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m2.5 6.2 2.3 2.3 4.7-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
