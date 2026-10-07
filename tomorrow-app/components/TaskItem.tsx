"use client";

import { useState } from "react";
import { formatDateKeyShort, formatDuration } from "@/lib/date";
import { PRIORITY_LABEL, type Priority, type Task, type TaskInput } from "@/lib/types";
import { TaskForm } from "./TaskForm";

interface Props {
  task: Task;
  rank: number | null;
  onToggle: (id: string) => void;
  onUpdate: (id: string, input: TaskInput) => void;
  onDelete: (id: string) => void;
}

const PRIORITY_STYLE: Record<Priority, string> = {
  high: "border-neutral-900 bg-neutral-900 text-white",
  medium: "border-neutral-300 text-neutral-700",
  low: "border-neutral-200 text-neutral-400",
};

export function TaskItem({ task, rank, onToggle, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-xl border border-neutral-300 bg-white p-4">
        <TaskForm
          initial={task}
          submitLabel="保存"
          onSubmit={(input) => {
            onUpdate(task.id, input);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  const handleDelete = () => {
    if (window.confirm(`「${task.title}」を削除しますか？`)) onDelete(task.id);
  };

  return (
    <li className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3.5 transition hover:border-neutral-300">
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task.id)}
        aria-label={`${task.title}を${task.completed ? "未完了に戻す" : "完了にする"}`}
        className="mt-0.5 size-5 shrink-0 cursor-pointer accent-neutral-900"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {rank !== null && (
            <span className="mt-px shrink-0 text-xs tabular-nums text-neutral-400">{rank}.</span>
          )}
          <p
            className={`break-words text-[15px] leading-snug ${
              task.completed ? "text-neutral-400 line-through" : "text-neutral-900"
            }`}
          >
            {task.title}
          </p>
        </div>
        <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${task.completed ? "opacity-50" : ""}`}>
          {task.carriedOverFrom && <CarriedOverBadge from={task.carriedOverFrom} />}
          <span className={`rounded border px-1.5 py-px ${PRIORITY_STYLE[task.priority]}`}>
            重要度 {PRIORITY_LABEL[task.priority]}
          </span>
          <span className="text-neutral-500">{task.deadline ? `${task.deadline} まで` : "締切なし"}</span>
          <span className="text-neutral-500">{formatDuration(task.estimatedMinutes)}</span>
        </div>
      </div>

      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
        >
          編集
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
        >
          削除
        </button>
      </div>
    </li>
  );
}

export function CarriedOverBadge({ from }: { from: string }) {
  return (
    <span
      className="rounded bg-neutral-100 px-1.5 py-px text-neutral-600"
      title={`${formatDateKeyShort(from)} から持ち越し`}
    >
      持ち越し
    </span>
  );
}
