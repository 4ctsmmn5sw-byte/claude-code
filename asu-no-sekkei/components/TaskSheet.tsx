"use client";

import { useDraggable } from "@dnd-kit/react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { TASK_COLORS, taskColor } from "@/lib/colors";
import { formatDuration } from "@/lib/time";
import type { Task } from "@/lib/types";
import type { DragData } from "./TimelineTaskBlock";

/** シートを下げたときに見えている高さ（px） */
export const PEEK_HEIGHT = 64;

export type SheetMode = "peek" | "open";

/**
 * 画面下部の、引き上げ可能な未配置タスク一覧。
 * - 上端のバーを上下にドラッグ（またはタップ）して開閉
 * - タスクをタップ → 「タップで配置」の選択、長押し → タイムラインへドラッグ
 * - topBar を渡すと、上端のバーをその内容（選択中タスクの操作など）に差し替える
 */
export function TaskSheet({
  sheetRef,
  tasks,
  mode,
  openHeight,
  onModeChange,
  topBar,
  highlight,
  onTapTask,
  onEditTask,
  onToggleDone,
}: {
  sheetRef: RefObject<HTMLElement | null>;
  tasks: Task[];
  mode: SheetMode;
  openHeight: number;
  onModeChange: (mode: SheetMode) => void;
  topBar: ReactNode | null;
  highlight: boolean;
  onTapTask: (id: string) => void;
  onEditTask: (id: string) => void;
  onToggleDone: (id: string) => void;
}) {
  const remaining = tasks.filter((t) => !t.done);
  const total = remaining.reduce((s, t) => s + t.durationMin, 0);
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  const pull = useRef<{ startY: number; startH: number; moved: boolean; lastY: number; lastT: number; v: number } | null>(null);
  const baseHeight = mode === "open" ? openHeight : PEEK_HEIGHT;
  const height = liveHeight ?? baseHeight;

  return (
    <section
      ref={sheetRef}
      data-testid="task-sheet"
      data-mode={mode}
      aria-label="未配置タスク"
      className={`absolute inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-[20px] bg-white shadow-[0_-6px_24px_rgb(0_0_0/0.10)] ring-1 ring-neutral-200/70 ${
        liveHeight === null ? "transition-[height] duration-250 ease-out" : ""
      } ${highlight ? "ring-2 ring-neutral-900" : ""}`}
      style={{ height }}
    >
      {/* 上端：引き上げバー */}
      <div
        className="no-callout relative flex shrink-0 touch-none select-none flex-col"
        style={{ height: PEEK_HEIGHT }}
        onPointerDown={(e) => {
          if (topBar || (e.target as HTMLElement).closest("button:not([data-sheet-toggle])")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pull.current = { startY: e.clientY, startH: height, moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
        }}
        onPointerMove={(e) => {
          const p = pull.current;
          if (!p) return;
          const dy = e.clientY - p.startY;
          if (Math.abs(dy) > 4) p.moved = true;
          if (!p.moved) return;
          const dt = Math.max(1, e.timeStamp - p.lastT);
          p.v = (e.clientY - p.lastY) / dt;
          p.lastY = e.clientY;
          p.lastT = e.timeStamp;
          setLiveHeight(Math.min(openHeight, Math.max(PEEK_HEIGHT, p.startH - dy)));
        }}
        onPointerUp={() => {
          const p = pull.current;
          pull.current = null;
          if (!p) return;
          if (!p.moved) {
            onModeChange(mode === "open" ? "peek" : "open");
          } else {
            const h = liveHeight ?? baseHeight;
            // 速く払ったら向き優先、ゆっくりなら近い方へ
            const next: SheetMode =
              p.v < -0.4 ? "open" : p.v > 0.4 ? "peek" : h > (openHeight + PEEK_HEIGHT) / 2 ? "open" : "peek";
            onModeChange(next);
          }
          setLiveHeight(null);
        }}
        onPointerCancel={() => {
          pull.current = null;
          setLiveHeight(null);
        }}
      >
        <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-300" aria-hidden />
        {topBar ?? (
          <button
            type="button"
            data-sheet-toggle
            aria-expanded={mode === "open"}
            className="flex flex-1 items-center justify-between px-5"
            onClick={(e) => e.preventDefault()}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onModeChange(mode === "open" ? "peek" : "open");
            }}
          >
            <span className="text-[15px] font-semibold text-neutral-900">
              未配置タスク <span className="ml-1 font-normal text-neutral-500">{remaining.length}件</span>
            </span>
            <span className="text-xs tabular-nums text-neutral-500">
              {total > 0 && formatDuration(total)}
              <span className="ml-2">{mode === "open" ? "下げる" : "引き上げる"}</span>
            </span>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {tasks.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm leading-relaxed text-neutral-500">
            未配置のタスクはありません。
            <br />
            下の「＋」から追加できます。
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-neutral-400">長押しでタイムラインへドラッグ ／ タップして空き時間をタップでも配置できます</p>
            <ul className="flex flex-col gap-2" data-testid="unplaced-list">
              {tasks.map((t) => (
                <UnplacedCard
                  key={t.id}
                  task={t}
                  onTap={() => onTapTask(t.id)}
                  onEdit={() => onEditTask(t.id)}
                  onToggleDone={() => onToggleDone(t.id)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function UnplacedCard({ task, onTap, onEdit, onToggleDone }: { task: Task; onTap: () => void; onEdit: () => void; onToggleDone: () => void }) {
  const { ref, handleRef, isDragSource, isDragging } = useDraggable<DragData>({
    id: `unplaced:${task.id}`,
    data: { taskId: task.id, kind: "unplaced" },
  });
  const lastDragAt = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    if (isDragging) return () => void (lastDragAt.current = performance.now());
  }, [isDragging]);
  const c = taskColor(task.color);
  return (
    <li
      ref={ref}
      data-testid="unplaced-task"
      data-task-id={task.id}
      className={`flex min-h-14 items-stretch overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 transition ${isDragSource ? "opacity-40" : ""}`}
      style={{ boxShadow: `inset 4px 0 0 ${c.accent}` }}
    >
      <button
        type="button"
        onClick={onToggleDone}
        aria-label={task.done ? "未完了に戻す" : "完了にする"}
        aria-pressed={task.done}
        className="grid w-12 shrink-0 place-items-center pl-1"
      >
        <span
          className="grid size-5 place-items-center rounded-full border-[1.5px]"
          style={{ borderColor: c.accent, backgroundColor: task.done ? c.accent : "transparent" }}
        >
          {task.done && (
            <svg viewBox="0 0 12 12" className="size-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m2.5 6.2 2.3 2.3 4.7-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </button>
      <div
        ref={handleRef}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (performance.now() - lastDragAt.current < 400) return;
          onTap();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTap();
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={`${task.title} ${task.durationMin}分（タップで配置先を選ぶ、長押しでドラッグ）`}
        className="no-callout flex min-w-0 flex-1 cursor-grab touch-manipulation select-none flex-col justify-center py-2 active:cursor-grabbing"
      >
        <span className={`truncate text-[15px] font-medium ${task.done ? "text-neutral-400 line-through" : "text-neutral-900"}`}>
          {task.title}
        </span>
        <span className="text-xs tabular-nums text-neutral-500">{formatDuration(task.durationMin)}</span>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="w-14 shrink-0 text-sm text-neutral-500 active:bg-neutral-100"
        aria-label={`${task.title}を編集`}
      >
        編集
      </button>
    </li>
  );
}

/** ドラッグ中に指へ付いてくる小さなカード */
export function DragChip({ task }: { task: Task }) {
  const c = taskColor(task.color);
  return (
    <div
      className="flex w-56 items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-neutral-900 ring-1 ring-neutral-200"
      style={{ boxShadow: `inset 4px 0 0 ${c.accent}, 0 12px 30px rgb(0 0 0 / 0.18)` }}
    >
      <span className="truncate">{task.title}</span>
      <span className="ml-auto shrink-0 text-xs tabular-nums text-neutral-500">{task.durationMin}分</span>
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
  colors = TASK_COLORS,
}: {
  value: string;
  onChange: (key: string) => void;
  colors?: typeof TASK_COLORS;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="色">
      {colors.map((c) => (
        <button
          key={c.key}
          type="button"
          role="radio"
          aria-checked={value === c.key}
          aria-label={c.label}
          onClick={() => onChange(c.key)}
          className="grid size-11 place-items-center rounded-full"
        >
          <span
            className={`size-7 rounded-full ring-offset-2 transition ${value === c.key ? "ring-2 ring-neutral-900" : ""}`}
            style={{ backgroundColor: c.accent }}
          />
        </button>
      ))}
    </div>
  );
}
