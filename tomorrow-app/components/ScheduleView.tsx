"use client";

import { formatDuration, minutesToTime } from "@/lib/date";
import type { Schedule } from "@/lib/schedule";
import { PRIORITY_LABEL, type DaySettings } from "@/lib/types";
import { CarriedOverBadge } from "./TaskItem";

interface Props {
  schedule: Schedule;
  settings: DaySettings;
  hasTasks: boolean;
  onChangeSettings: (settings: DaySettings) => void;
  /** 今日のスケジュールで渡す現在時刻（0:00 からの分数）。過去の枠を薄く表示する */
  nowMinutes?: number;
}

const timeInputClass =
  "rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm tabular-nums text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100";

export function ScheduleView({ schedule, settings, hasTasks, onChangeSettings, nowMinutes }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <span className="text-xs text-neutral-500">活動時間</span>
        <div className="flex items-center gap-2">
          <input
            type="time"
            aria-label="開始時刻"
            value={settings.dayStart}
            onChange={(e) => onChangeSettings({ ...settings, dayStart: e.target.value })}
            className={timeInputClass}
          />
          <span className="text-neutral-400">〜</span>
          <input
            type="time"
            aria-label="終了時刻"
            value={settings.dayEnd}
            onChange={(e) => onChangeSettings({ ...settings, dayEnd: e.target.value })}
            className={timeInputClass}
          />
        </div>
        {schedule.ok && (
          <span className="ml-auto text-xs tabular-nums text-neutral-500">
            合計 {formatDuration(schedule.totalMinutes)} / {formatDuration(schedule.availableMinutes)}
          </span>
        )}
      </div>

      {!schedule.ok ? (
        <p className="text-xs text-red-600">{schedule.error}</p>
      ) : !hasTasks ? (
        <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm text-neutral-400">
          タスクを追加すると、明日のスケジュールが自動で組まれます。
        </p>
      ) : (
        <>
          {schedule.slots.length > 0 && (
            <ol className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
              {schedule.slots.map(({ task, start, end, late }) => {
                const past = nowMinutes !== undefined && end <= nowMinutes;
                return (
                <li
                  key={task.id}
                  data-past={past || undefined}
                  className={`flex gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0 sm:gap-4 ${
                    past ? "bg-neutral-50 opacity-50" : ""
                  }`}
                >
                  <span
                    className={`w-[6.5rem] shrink-0 pt-px text-sm tabular-nums ${
                      task.completed ? "text-neutral-300" : "text-neutral-500"
                    }`}
                  >
                    {minutesToTime(start)}–{minutesToTime(end)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`break-words text-[15px] leading-snug ${
                        task.completed ? "text-neutral-400 line-through" : "text-neutral-900"
                      }`}
                    >
                      {task.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-neutral-500">
                      {task.carriedOverFrom && <CarriedOverBadge from={task.carriedOverFrom} />}
                      <span>重要度 {PRIORITY_LABEL[task.priority]}</span>
                      {task.deadline && <span>締切 {task.deadline}</span>}
                      {late && !task.completed && <span className="text-red-600">締切に間に合いません</span>}
                    </div>
                  </div>
                </li>
                );
              })}
            </ol>
          )}

          {schedule.overflow.length > 0 && (
            <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-3">
              <p className="text-xs font-medium text-neutral-700">
                活動時間内に入りきらないタスク（{schedule.overflow.length}件）
              </p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-500">
                {schedule.overflow.map((t) => (
                  <li key={t.id} className="flex justify-between gap-3">
                    <span className="min-w-0 break-words">{t.title}</span>
                    <span className="shrink-0 text-xs tabular-nums">{formatDuration(t.estimatedMinutes)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-neutral-400">活動時間を延ばすか、タスクを減らすことを検討しましょう。</p>
            </div>
          )}

          <p className="text-xs text-neutral-400">
            締切・重要度・所要時間から自動で割り当てています（タスク間に10分の休憩）。
            {nowMinutes !== undefined && "完了済みは完了時の予定時間のまま、未完了は現在時刻以降に組み直しています。"}
          </p>
        </>
      )}
    </div>
  );
}
