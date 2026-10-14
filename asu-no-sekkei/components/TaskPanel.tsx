"use client";

import { useDraggable } from "@dnd-kit/react";
import { useState, type RefObject } from "react";
import { DEFAULT_TASK_COLOR, TASK_COLORS, taskColor } from "@/lib/colors";
import type { ActionResult } from "@/lib/store";
import { formatDuration } from "@/lib/time";
import type { Task } from "@/lib/types";
import type { DragData } from "./TimelineTaskBlock";

const QUICK_DURATIONS = [15, 30, 60, 90];

/**
 * 左カラム（スマホでは下部の開閉シート）。タスクの追加と未配置タスクの一覧。
 * 配置済みタスクをここへドラッグすると未配置に戻る。
 */
export function TaskPanel({
  panelRef,
  tasks,
  open,
  onToggleOpen,
  highlight,
  onAdd,
  onOpenTask,
  onToggleDone,
}: {
  panelRef: RefObject<HTMLElement | null>;
  tasks: Task[];
  open: boolean;
  onToggleOpen: () => void;
  highlight: boolean;
  onAdd: (input: { title: string; durationMin: number; color: string }) => ActionResult;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
}) {
  const remaining = tasks.filter((t) => !t.done);
  const total = remaining.reduce((sum, t) => sum + t.durationMin, 0);

  return (
    <aside
      ref={panelRef}
      data-testid="task-panel"
      className={`fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t border-neutral-200 bg-white shadow-[0_-8px_30px_rgb(0_0_0/0.08)] transition-[max-height] duration-300 lg:static lg:z-auto lg:max-h-none lg:rounded-none lg:border-r lg:border-t-0 lg:shadow-none ${
        open ? "max-h-[62dvh]" : "max-h-14"
      } ${highlight ? "ring-2 ring-inset ring-neutral-900/60" : ""}`}
    >
      {/* スマホ用の開閉バー */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-controls="task-panel-body"
        className="flex h-14 shrink-0 items-center justify-between px-5 lg:hidden"
      >
        <span className="text-sm font-semibold text-neutral-900">
          未配置タスク <span className="ml-1 text-neutral-500">{remaining.length}件</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-neutral-500">
          {open ? "閉じる" : "開く"}
          <svg viewBox="0 0 20 20" className={`size-4 transition ${open ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <div id="task-panel-body" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6 lg:px-5 lg:pt-5">
        <div className="hidden items-baseline justify-between lg:flex">
          <h2 className="text-sm font-semibold text-neutral-900">未配置タスク</h2>
          <span className="text-xs tabular-nums text-neutral-500">
            {remaining.length}件{total > 0 && ` ・ ${formatDuration(total)}`}
          </span>
        </div>

        <AddTaskForm onAdd={onAdd} />

        {tasks.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-xs leading-relaxed text-neutral-500">
            タスクを追加すると、ここに並びます。
            <br />
            右のタイムラインへドラッグして時間を決めましょう。
          </p>
        ) : (
          <>
            <p className="mt-5 mb-2 text-[11px] text-neutral-400">
              <span className="hidden [@media(pointer:fine)]:inline">ドラッグしてタイムラインに配置</span>
              <span className="[@media(pointer:fine)]:hidden">長押ししてタイムラインへドラッグ</span>
            </p>
            <ul className="flex flex-col gap-2" data-testid="unplaced-list">
              {tasks.map((t) => (
                <UnplacedCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} onToggleDone={() => onToggleDone(t.id)} />
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}

function AddTaskForm({ onAdd }: { onAdd: (input: { title: string; durationMin: number; color: string }) => ActionResult }) {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("30");
  const [color, setColor] = useState(DEFAULT_TASK_COLOR);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-1 flex flex-col gap-3 rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200/70 lg:mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        const result = onAdd({ title, durationMin: Number(duration), color });
        if (result.ok) {
          setTitle("");
          setError(null);
        } else {
          setError(result.message);
        }
      }}
    >
      <input
        aria-label="タスク名"
        placeholder="タスク名（例：レポートを書く）"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-base outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 sm:text-sm"
      />
      <div className="flex flex-wrap items-center gap-1">
        <label className="mr-1 flex items-center gap-1 text-xs text-neutral-500">
          所要
          <input
            aria-label="予定所要時間（分）"
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            step={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="h-8 w-14 rounded-md border border-neutral-200 bg-white px-2 text-right text-base tabular-nums outline-none focus:border-neutral-400 sm:text-sm"
          />
          分
        </label>
        {QUICK_DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDuration(String(d))}
            className={`h-7 rounded-full px-2 text-xs tabular-nums transition ${
              Number(duration) === d ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-100"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <ColorPicker value={color} onChange={setColor} />
        <button
          type="submit"
          className="h-9 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          追加
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </form>
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
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="色">
      {colors.map((c) => (
        <button
          key={c.key}
          type="button"
          role="radio"
          aria-checked={value === c.key}
          aria-label={c.label}
          onClick={() => onChange(c.key)}
          className={`size-6 rounded-full ring-offset-2 transition ${value === c.key ? "ring-2 ring-neutral-900" : "hover:scale-110"}`}
          style={{ backgroundColor: c.accent }}
        />
      ))}
    </div>
  );
}

function UnplacedCard({ task, onOpen, onToggleDone }: { task: Task; onOpen: () => void; onToggleDone: () => void }) {
  const { ref, isDragSource } = useDraggable<DragData>({
    id: `unplaced:${task.id}`,
    data: { taskId: task.id, kind: "unplaced" },
  });
  const c = taskColor(task.color);
  return (
    <li
      ref={ref}
      data-testid="unplaced-task"
      data-task-id={task.id}
      className={`flex cursor-grab touch-manipulation select-none items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-neutral-200 transition hover:ring-neutral-300 active:cursor-grabbing ${
        isDragSource ? "opacity-40" : ""
      }`}
      style={{ boxShadow: `inset 3px 0 0 ${c.accent}` }}
    >
      <button
        type="button"
        onClick={onToggleDone}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={task.done ? "未完了に戻す" : "完了にする"}
        aria-pressed={task.done}
        className="grid size-5 shrink-0 place-items-center rounded-full border-[1.5px]"
        style={{ borderColor: c.accent, backgroundColor: task.done ? c.accent : "transparent" }}
      >
        {task.done && (
          <svg viewBox="0 0 12 12" className="size-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m2.5 6.2 2.3 2.3 4.7-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-medium text-neutral-900 ${task.done ? "text-neutral-400 line-through" : ""}`}>
          {task.title}
        </div>
        <div className="text-xs tabular-nums text-neutral-500">{formatDuration(task.durationMin)}</div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        onPointerDown={(e) => e.stopPropagation()}
        className="h-8 shrink-0 rounded-md px-2 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        aria-label={`${task.title}を編集`}
      >
        編集
      </button>
    </li>
  );
}

/** ドラッグ中にポインタへ付いてくる小さなカード */
export function DragChip({ task }: { task: Task }) {
  const c = taskColor(task.color);
  return (
    <div
      className="flex w-56 items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-neutral-900 shadow-xl ring-1 ring-neutral-200"
      style={{ boxShadow: `inset 3px 0 0 ${c.accent}, 0 12px 30px rgb(0 0 0 / 0.15)` }}
    >
      <span className="truncate">{task.title}</span>
      <span className="ml-auto shrink-0 text-xs tabular-nums text-neutral-500">{task.durationMin}分</span>
    </div>
  );
}
