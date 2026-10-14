"use client";

import { useState } from "react";
import { formatDateLabel } from "@/lib/date";
import { checkPlacement } from "@/lib/schedule";
import { actions } from "@/lib/store";
import { formatMinutes } from "@/lib/time";
import type { DateKey, FixedEvent, Task } from "@/lib/types";
import { Modal } from "./Modal";
import { ColorPicker } from "./TaskSheet";
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
    <Modal title="タスクを編集" onClose={onClose} testId="task-dialog">
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
              className="h-12 rounded-xl border border-neutral-200 px-4 text-base outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            />
          </div>

          <fieldset className="rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200/70">
            <legend className="sr-only">時刻と所要時間（1分単位）</legend>
            <p className="mb-2 text-xs text-neutral-500">
              {placed ? `${formatDateLabel(targetDate)}に配置中` : `開始時刻を入れると${formatDateLabel(targetDate)}に配置します`}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <TimeInput id="task-start" label="開始" value={start} onChange={changeStart} invalid={placementCheck?.ok === false} />
              <TimeInput id="task-end" label="終了" value={end} onChange={changeEnd} allow24 invalid={placementCheck?.ok === false} />
              <div className="flex flex-col gap-1">
                <label htmlFor="task-duration" className="text-xs font-medium text-neutral-500">
                  所要（分）
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
                  className="h-12 w-full rounded-xl border border-neutral-200 bg-white px-3 text-base tabular-nums outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                />
              </div>
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

          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-500">色</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="h-12 w-full rounded-xl bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700">
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                actions.toggleDone(task.id);
                onClose();
              }}
              className="h-11 flex-1 rounded-xl px-3 text-sm text-neutral-700 ring-1 ring-neutral-200 active:bg-neutral-50"
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
                className="h-11 flex-1 rounded-xl px-3 text-sm text-neutral-700 ring-1 ring-neutral-200 active:bg-neutral-50"
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
              className="h-11 flex-1 rounded-xl px-3 text-sm text-rose-600 ring-1 ring-rose-100 active:bg-rose-50"
            >
              削除
            </button>
          </div>
        </form>
    </Modal>
  );
}
