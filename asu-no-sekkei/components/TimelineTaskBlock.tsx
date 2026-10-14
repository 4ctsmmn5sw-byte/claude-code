"use client";

import { useDraggable } from "@dnd-kit/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { taskColor } from "@/lib/colors";
import type { PlacementCheck } from "@/lib/schedule";
import { clamp, DAY_MINUTES, formatMinutes, minutesToY, snap, yToMinutes } from "@/lib/time";
import type { Task } from "@/lib/types";

export type DragData = { taskId: string; kind: "placed" | "unplaced" };

/**
 * タイムライン上の配置済みタスク。
 * - 本体：@dnd-kit/react でドラッグ（時刻の計算は Planner 側でポインタ座標から行う）
 * - 下端ハンドル：Pointer Events で長さを変更（setPointerCapture でハンドル外に出ても追従）
 */
export function TimelineTaskBlock({
  task,
  conflict,
  dimmed,
  snapMinutes,
  bodyRef,
  onOpen,
  onToggleDone,
  onResize,
  validate,
}: {
  task: Task & { startMin: number };
  conflict: boolean;
  dimmed: boolean;
  snapMinutes: number;
  bodyRef: RefObject<HTMLDivElement | null>;
  onOpen: () => void;
  onToggleDone: () => void;
  onResize: (durationMin: number) => void;
  validate: (startMin: number, endMin: number) => PlacementCheck;
}) {
  const { ref, handleRef, isDragging } = useDraggable<DragData>({
    id: `placed:${task.id}`,
    data: { taskId: task.id, kind: "placed" },
  });
  const [resizeEnd, setResizeEnd] = useState<number | null>(null);
  const resizing = useRef(false);
  // ドラッグ直後に発生する click で編集画面が開かないようにする
  const lastDragAt = useRef(0);
  useEffect(() => {
    if (isDragging) return () => void (lastDragAt.current = performance.now());
  }, [isDragging]);

  const c = taskColor(task.color);
  const endMin = resizeEnd ?? task.startMin + task.durationMin;
  const duration = endMin - task.startMin;
  const heightPx = minutesToY(duration);
  const resizeCheck = resizeEnd !== null ? validate(task.startMin, resizeEnd) : null;
  const invalid = conflict || (resizeCheck !== null && !resizeCheck.ok);
  const compact = heightPx < 34;

  const endFromPointer = (clientY: number) => {
    const top = bodyRef.current?.getBoundingClientRect().top ?? 0;
    const raw = snap(yToMinutes(clientY - top), snapMinutes);
    return clamp(raw, task.startMin + snapMinutes, DAY_MINUTES);
  };

  return (
    <div
      ref={ref}
      data-testid="task-block"
      data-task-id={task.id}
      data-start={task.startMin}
      data-end={endMin}
      className={`group absolute inset-x-0 z-20 transition-opacity ${dimmed ? "opacity-35" : ""}`}
      style={{ top: minutesToY(task.startMin), height: Math.max(heightPx, 6) }}
    >
      <div
        ref={handleRef}
        role="button"
        tabIndex={0}
        aria-label={`${task.title} ${formatMinutes(task.startMin)}から${formatMinutes(endMin)}。クリックで編集、ドラッグで移動`}
        onClick={() => {
          if (performance.now() - lastDragAt.current < 400 || resizing.current) return;
          onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className={`flex h-full cursor-grab touch-manipulation select-none overflow-hidden rounded-lg text-left outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-neutral-400 active:cursor-grabbing ${
          invalid ? "ring-2 ring-rose-500" : ""
        } ${task.done ? "opacity-60" : ""}`}
        style={{
          backgroundColor: c.bg,
          color: c.text,
          boxShadow: `inset 3px 0 0 ${c.accent}, 0 1px 2px rgb(0 0 0 / 0.06)`,
        }}
      >
        <div className={`flex min-w-0 flex-1 gap-2 pl-2.5 pr-2 ${compact ? "items-center" : "items-start pt-1.5"}`}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={task.done ? "未完了に戻す" : "完了にする"}
            aria-pressed={task.done}
            className={`grid shrink-0 place-items-center rounded-full border-[1.5px] transition ${compact ? "size-3.5" : "size-4"}`}
            style={{ borderColor: c.accent, backgroundColor: task.done ? c.accent : "transparent" }}
          >
            {task.done && (
              <svg viewBox="0 0 12 12" className="size-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m2.5 6.2 2.3 2.3 4.7-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <div className={`min-w-0 flex-1 ${compact ? "flex items-baseline gap-2" : ""}`}>
            <div className={`truncate text-[13px] font-semibold leading-tight ${task.done ? "line-through" : ""}`}>
              {task.title}
            </div>
            <div className="truncate text-[11px] tabular-nums opacity-75">
              {formatMinutes(task.startMin)}–{formatMinutes(endMin)}
              {!compact && <span className="ml-1.5">（{duration}分）</span>}
            </div>
            {conflict && !compact && <div className="mt-0.5 text-[11px] font-semibold text-rose-600">他の予定と重複しています</div>}
          </div>
        </div>
      </div>

      {/* 長さ変更ハンドル */}
      <div
        data-testid="resize-handle"
        role="slider"
        aria-label={`${task.title}の終了時刻`}
        aria-valuemin={task.startMin + 1}
        aria-valuemax={DAY_MINUTES}
        aria-valuenow={endMin}
        aria-valuetext={formatMinutes(endMin)}
        tabIndex={-1}
        className="absolute inset-x-0 -bottom-1.5 z-10 flex h-3.5 cursor-ns-resize touch-none items-center justify-center"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          resizing.current = true;
          setResizeEnd(endFromPointer(e.clientY));
        }}
        onPointerMove={(e) => {
          if (!resizing.current) return;
          setResizeEnd(endFromPointer(e.clientY));
        }}
        onPointerUp={(e) => {
          if (!resizing.current) return;
          const end = endFromPointer(e.clientY);
          resizing.current = false;
          setResizeEnd(null);
          if (end !== task.startMin + task.durationMin) onResize(end - task.startMin);
        }}
        onPointerCancel={() => {
          resizing.current = false;
          setResizeEnd(null);
        }}
      >
        <span
          className={`h-1 w-8 rounded-full transition ${
            resizeEnd !== null ? "opacity-100" : "opacity-60 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
          }`}
          style={{ backgroundColor: c.accent }}
        />
      </div>

      {resizeEnd !== null && (
        <div
          className={`pointer-events-none absolute -bottom-7 right-0 z-40 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums text-white shadow ${
            resizeCheck && !resizeCheck.ok ? "bg-rose-600" : "bg-neutral-900"
          }`}
        >
          {resizeCheck && !resizeCheck.ok ? "重複" : `〜${formatMinutes(resizeEnd)}（${duration}分）`}
        </div>
      )}
    </div>
  );
}
