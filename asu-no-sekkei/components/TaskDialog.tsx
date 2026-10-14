"use client";

import { useState } from "react";
import type { ToastAction } from "@/hooks/useToast";
import { FIXED_COLORS, fixedColorForTask } from "@/lib/colors";
import { formatDateLabel, WEEKDAY_LABELS, WEEKDAY_ORDER, weekdayOf } from "@/lib/date";
import { checkPlacement, ruleConflicts } from "@/lib/schedule";
import { actions } from "@/lib/store";
import { formatMinutes } from "@/lib/time";
import type { DateKey, FixedEvent, Task, Weekday } from "@/lib/types";
import { Modal } from "./Modal";
import { ColorPicker } from "./TaskSheet";
import { TimeInput } from "./TimeInput";
import { ConflictWarning, DateField, WeekdayPicker } from "./WeeklyFields";

type Repeat = "none" | "weekly";

/**
 * タスクの編集ダイアログ。名前・所要時間・色に加えて、開始／終了時刻を 1 分単位で直接入力できる。
 * 未配置のタスクに開始時刻を入れると、表示中の日付に配置される。
 * 「毎週繰り返す」にすると、曜日・繰り返し期間を選んで毎週の固定予定に変えられる
 * （固定予定は曜日の規則として 1 件だけ保存し、元のタスクは削除される）。
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
  notify: (message: string, tone?: "info" | "error", action?: ToastAction) => void;
}) {
  const placed = task.date !== null && task.startMin !== null;
  const targetDate = task.date ?? viewDate;
  const [title, setTitle] = useState(task.title);
  const [color, setColor] = useState(task.color);
  const [duration, setDuration] = useState(String(task.durationMin));
  const [start, setStart] = useState<number | null>(task.startMin);
  const [end, setEnd] = useState<number | null>(task.startMin !== null ? task.startMin + task.durationMin : null);
  const [error, setError] = useState<string | null>(null);
  // 繰り返し設定（毎週繰り返す場合だけ使う）
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [weekdays, setWeekdays] = useState<Weekday[]>(() => [weekdayOf(targetDate)]);
  const [repeatFrom, setRepeatFrom] = useState<DateKey | null>(targetDate);
  const [repeatTo, setRepeatTo] = useState<DateKey | null>(null);
  const [fixedColorKey, setFixedColorKey] = useState(() => fixedColorForTask(task.color));
  const weekly = repeat === "weekly";

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
    !weekly && start !== null && end !== null ? checkPlacement(tasks, fixedEvents, targetDate, task.id, start, end) : null;

  // 毎週の規則にしたとき重なる既存の予定（このタスク自身は変換で消えるので除く）
  const conflicts =
    weekly && start !== null && end !== null && end > start && weekdays.length > 0
      ? ruleConflicts({ weekdays, startMin: start, endMin: end, validFrom: repeatFrom, validTo: repeatTo }, tasks, fixedEvents, {
          excludeTaskId: task.id,
        })
      : { tasks: [], fixed: [] };
  const hasConflicts = conflicts.tasks.length + conflicts.fixed.length > 0;

  const saveWeekly = () => {
    if (!title.trim()) return setError("予定名を入力してください");
    if (start === null || end === null) return setError("開始時刻と終了時刻を入力してください");
    if (weekdays.length === 0) return setError("繰り返す曜日を1つ以上選んでください");
    if (!repeatFrom) return setError("繰り返し開始日を入力してください");
    const r = actions.convertTaskToWeekly(task.id, {
      title,
      weekdays,
      startMin: start,
      endMin: end,
      color: fixedColorKey,
      validFrom: repeatFrom,
      validTo: repeatTo,
    });
    if (!r.ok) return setError(r.message);
    const days = WEEKDAY_ORDER.filter((w) => weekdays.includes(w))
      .map((w) => WEEKDAY_LABELS[w])
      .join("・");
    const { eventId, task: original } = r;
    notify(
      `毎週${days} ${formatMinutes(start)}–${formatMinutes(end)}の固定予定にしました`,
      "info",
      eventId && original ? { label: "元に戻す", run: () => actions.undoConvertTask(eventId, original) } : undefined,
    );
    onClose();
  };

  const save = () => {
    if (weekly) return saveWeekly();
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
              {weekly ? "予定名" : "タスク名"}
            </label>
            <input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              className="h-12 rounded-xl border border-neutral-200 px-4 text-base outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            />
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-500">繰り返し設定</span>
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1" role="radiogroup" aria-label="繰り返し設定">
              {(
                [
                  ["none", "繰り返さない"],
                  ["weekly", "毎週繰り返す"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={repeat === v}
                  onClick={() => {
                    setRepeat(v);
                    setError(null);
                  }}
                  className={`h-11 rounded-xl text-sm font-medium transition ${
                    repeat === v ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 active:bg-neutral-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <fieldset className="rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200/70">
            <legend className="sr-only">時刻と所要時間（1分単位）</legend>
            <p className="mb-2 text-xs text-neutral-500">
              {weekly
                ? "毎週この時刻に表示します"
                : placed
                  ? `${formatDateLabel(targetDate)}に配置中`
                  : `開始時刻を入れると${formatDateLabel(targetDate)}に配置します`}
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

          {weekly && (
            <>
              <WeekdayPicker legend="繰り返す曜日（複数選択できます）" value={weekdays} onChange={setWeekdays} />
              <div className="grid grid-cols-2 gap-3">
                <DateField id="repeat-from" label="繰り返し開始日" value={repeatFrom} onChange={setRepeatFrom} clearable={false} emptyLabel="入力してください" />
                <DateField id="repeat-to" label="繰り返し終了日" value={repeatTo} onChange={setRepeatTo} emptyLabel="未指定（ずっと繰り返す）" />
              </div>
            </>
          )}

          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-500">{weekly ? "予定の色（固定予定用の落ち着いた色）" : "色"}</span>
            {weekly ? (
              <ColorPicker value={fixedColorKey} onChange={setFixedColorKey} colors={FIXED_COLORS} />
            ) : (
              <ColorPicker value={color} onChange={setColor} />
            )}
          </div>

          {weekly && <ConflictWarning conflicts={conflicts} />}
          {weekly && (
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-neutral-500">
              <LockIcon />
              保存すると鍵マーク付きの毎週の固定予定になります。元のタスクは一覧・時間割から消え、重複して残りません。
            </p>
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="h-12 w-full rounded-xl bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700">
              {weekly ? (hasConflicts ? "重なりを確認して毎週の予定にする" : "毎週の予定にする") : "保存"}
            </button>
            {!weekly && (
              <>
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
              </>
            )}
          </div>
        </form>
    </Modal>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 size-3 shrink-0" fill="currentColor" aria-hidden>
      <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
    </svg>
  );
}
