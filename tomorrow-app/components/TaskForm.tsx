"use client";

import { useState, type FormEvent } from "react";
import { PRIORITY_LABEL, type Priority, type TaskInput } from "@/lib/types";

interface Props {
  initial?: TaskInput;
  submitLabel: string;
  disabled?: boolean;
  onSubmit: (input: TaskInput) => void;
  onCancel?: () => void;
}

const EMPTY: TaskInput = { title: "", priority: "medium", deadline: "", estimatedMinutes: 30 };
const PRIORITIES: Priority[] = ["high", "medium", "low"];
const MAX_MINUTES = 24 * 60;

export function TaskForm({ initial = EMPTY, submitLabel, disabled, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [priority, setPriority] = useState<Priority>(initial.priority);
  const [deadline, setDeadline] = useState(initial.deadline);
  const [minutes, setMinutes] = useState(String(initial.estimatedMinutes));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    const parsed = Number(minutes);
    if (!trimmed) return setError("タスク名を入力してください");
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_MINUTES) {
      return setError(`所要時間は 1〜${MAX_MINUTES} の整数（分）で入力してください`);
    }
    onSubmit({ title: trimmed, priority, deadline, estimatedMinutes: parsed });
    setError(null);
    if (!onCancel) {
      // 追加フォームは連続入力しやすいようタスク名だけリセット
      setTitle("");
    }
  };

  const labelClass = "mb-1 block text-xs text-neutral-500";
  const inputClass =
    "w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100";

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="明日やること"
        aria-label="タスク名"
        maxLength={100}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        className={`${inputClass} py-2.5 text-[15px]`}
        autoFocus={Boolean(onCancel)}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_1fr]">
        <div>
          <span className={labelClass}>重要度</span>
          <div className="inline-flex w-full rounded-md border border-neutral-200 p-0.5 sm:w-auto" role="radiogroup" aria-label="重要度">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={priority === p}
                onClick={() => setPriority(p)}
                className={`flex-1 rounded px-3.5 py-1.5 text-sm transition sm:flex-none ${
                  priority === p ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
                }`}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:contents">
          <label>
            <span className={labelClass}>締切時間</span>
            <input type="time" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass} />
          </label>
          <label>
            <span className={labelClass}>所要時間（分）</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_MINUTES}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3.5 py-2 text-sm text-neutral-500 transition hover:bg-neutral-100"
          >
            キャンセル
          </button>
        )}
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
