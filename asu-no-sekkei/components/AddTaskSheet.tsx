"use client";

import { useState } from "react";
import { DEFAULT_TASK_COLOR } from "@/lib/colors";
import type { ActionResult } from "@/lib/store";
import { Modal } from "./Modal";
import { ColorPicker } from "./TaskSheet";

const QUICK_DURATIONS = [15, 30, 45, 60, 90, 120];

/** タスクの追加（時間は未配置のまま登録する） */
export function AddTaskSheet({
  onAdd,
  onClose,
}: {
  onAdd: (input: { title: string; durationMin: number; color: string }) => ActionResult;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("30");
  const [color, setColor] = useState(DEFAULT_TASK_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);

  return (
    <Modal title="タスクを追加" onClose={onClose} testId="add-task-sheet">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const r = onAdd({ title, durationMin: Number(duration), color });
          if (!r.ok) return setError(r.message);
          setTitle("");
          setError(null);
          setAdded((n) => n + 1);
        }}
      >
        <input
          aria-label="タスク名"
          placeholder="タスク名（例：レポートを書く）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          autoFocus
          className="h-12 rounded-xl border border-neutral-200 px-4 text-base outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
        />
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <label htmlFor="add-duration" className="text-xs font-medium text-neutral-500">
              予定所要時間
            </label>
            <input
              id="add-duration"
              aria-label="予定所要時間（分）"
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              step={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="h-11 w-20 rounded-lg border border-neutral-200 px-3 text-right text-base tabular-nums outline-none focus:border-neutral-400"
            />
            <span className="text-sm text-neutral-500">分</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(String(d))}
                className={`h-11 min-w-12 rounded-full px-3 text-sm tabular-nums transition ${
                  Number(duration) === d ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 active:bg-neutral-200"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-500">色</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {added > 0 && !error && <p className="text-sm text-neutral-500">未配置タスクに追加しました（続けて入力できます）</p>}
        <button type="submit" className="h-12 rounded-xl bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700">
          追加
        </button>
      </form>
    </Modal>
  );
}
