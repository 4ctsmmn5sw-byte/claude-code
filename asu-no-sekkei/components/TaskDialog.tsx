"use client";

import { useEffect, useState } from "react";
import { formatDateLabel } from "@/lib/date";
import { checkPlacement } from "@/lib/schedule";
import { actions } from "@/lib/store";
import { formatMinutes } from "@/lib/time";
import type { DateKey, FixedEvent, Task } from "@/lib/types";
import { ColorPicker } from "./TaskPanel";
import { TimeInput } from "./TimeInput";

/**
 * タスクの編集ダイアログ。名前・所要時間・色に加えて、開始／終了時刻を 1 分単位で直接入力できる。
 * 未配置のタスクに開始時刻を入れると、表示中の日付に配置される。
 */
export function TaskDialog({
  task,
  viewDate,
  tasks,
  fixedEvents,
  onClose,
  notify,
}: {
  task: Task;
  viewDate: DateKey;
  tasks: Task[];
  fixedEvents: FixedEvent[];
  onClose: () => void;
  notify: (message: string, tone?: "info" | "error") => void;
}) {
  const placed = task.date !== null && task.startMin !== null;
  const targetDate = task.date ?? viewDate;
  const [title, setTitle] = useState(task.title);
  const [color, setColor] = useState(task.color);
  const [duration, setDuration] = useState(String(task.durationMin));
  const [start, setStart] = useState<number | null>(task.startMin);
  const [end, setEnd] = useState<number | null>(task.startMin !== null ? task.startMin + task.durationMin : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const durationNum = Number(duration);
  const durationValid = Number.isInteger(durationNum) && durationNum >= 1 && durationNum <= 1440;

  // 開始を変えたら所要時間を保って終了を動かす。終了を変えたら所要時間を更新する
  const changeStart = (v: number | null) => {
    setStart(v);
    if (v !== null && durationValid) setEnd(v + durationNum);
    if (v === null) setEnd(null);
  };
  const changeEnd = (v: number | null) => {
    setEnd(v);
    if (v !== null && start !== null && v > start) setDuration(String(v - start));
  };
  const changeDuration = (v: string) => {
    setDuration(v);
    const n = Number(v);
    if (start !== null && Number.isInteger(n) && n >= 1) setEnd(start + n);
  };

  const placementCheck =
    start !== null && end !== null ? checkPlacement(tasks, fixedEvents, targetDate, task.id, start, end) : null;

  const save = () => {
    if (!title.trim()) return setError("タスク名を入力してください");
    if (start !== null) {
      if (end === null) return setError("終了時刻を入力してください");
      if (placementCheck && !placementCheck.ok) return setError(placementCheck.message);
      const edited = actions.editTask(task.id, { title, color });
      if (!edited.ok) return setError(edited.message);
      const result = actions.placeTask(task.id, targetDate, start, end - start);
      if (!result.ok) return setError(result.message);
    } else {
      if (!durationValid) return setError("所要時間は1〜1440分で入力してください");
      const edited = actions.editTask(task.id, { title, color, durationMin: durationNum });
      if (!edited.ok) return setError(edited.message);
      if (placed) actions.unplaceTask(task.id);
    }
    notify("保存しました");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-dialog-title"
        data-testid="task-dialog"
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="task-dialog-title" className="text-base font-semibold text-neutral-900">
            タスクを編集
          </h2>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100" aria-label="閉じる">
            ✕
          </button>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="task-title" className="text-xs font-medium text-neutral-500">
              タスク名
            </label>
            <input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              className="h-10 rounded-lg border border-neutral-200 px-3 text-base outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="task-duration" className="text-xs font-medium text-neutral-500">
                所要時間（分）
              </label>
              <input
                id="task-duration"
                type="number"
                inputMode="numeric"
                min={1}
                max={1440}
                step={1}
                value={duration}
                onChange={(e) => changeDuration(e.target.value)}
                className="h-10 w-28 rounded-lg border border-neutral-200 px-3 text-base tabular-nums outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-neutral-500">色</span>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>

          <fieldset className="rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200/70">
            <legend className="sr-only">時刻</legend>
            <p className="mb-2 text-xs text-neutral-500">
              {placed ? `${formatDateLabel(targetDate)}に配置中` : `開始時刻を入れると${formatDateLabel(targetDate)}に配置します`}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <TimeInput id="task-start" label="開始" value={start} onChange={changeStart} invalid={placementCheck?.ok === false} />
              <TimeInput id="task-end" label="終了" value={end} onChange={changeEnd} allow24 invalid={placementCheck?.ok === false} />
            </div>
            {placementCheck && !placementCheck.ok && (
              <p className="mt-2 text-xs text-rose-600" role="alert">
                {placementCheck.message}
              </p>
            )}
            {placementCheck?.ok && start !== null && end !== null && (
              <p className="mt-2 text-xs tabular-nums text-neutral-500">
                {formatMinutes(start)}–{formatMinutes(end)}（{end - start}分）
              </p>
            )}
          </fieldset>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="h-10 rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-700">
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                actions.toggleDone(task.id);
                onClose();
              }}
              className="h-10 rounded-lg px-3 text-sm text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
            >
              {task.done ? "未完了に戻す" : "完了にする"}
            </button>
            {placed && (
              <button
                type="button"
                onClick={() => {
                  actions.unplaceTask(task.id);
                  notify("未配置に戻しました");
                  onClose();
                }}
                className="h-10 rounded-lg px-3 text-sm text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
              >
                未配置に戻す
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(`「${task.title}」を削除しますか？`)) return;
                actions.deleteTask(task.id);
                notify("削除しました");
                onClose();
              }}
              className="ml-auto h-10 rounded-lg px-3 text-sm text-rose-600 hover:bg-rose-50"
            >
              削除
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
