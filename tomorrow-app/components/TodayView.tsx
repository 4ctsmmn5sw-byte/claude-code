"use client";

import { useState } from "react";
import { minutesToTime } from "@/lib/date";
import type { Schedule } from "@/lib/schedule";
import { slotStatus } from "@/lib/todayPlan";
import type { DaySettings, Task, TaskInput } from "@/lib/types";
import { ModeToggle, type Mode } from "./ModeToggle";
import { ScheduleView } from "./ScheduleView";
import { StatusBadge } from "./StatusBadge";
import { TaskItem } from "./TaskItem";

interface Props {
  tasks: Task[];
  schedule: Schedule;
  todayKey: string;
  nowMinutes: number;
  settings: DaySettings;
  onChangeSettings: (settings: DaySettings) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, input: TaskInput) => void;
  onDelete: (id: string) => void;
  onCarryOver: (ids: string[]) => void;
  onReplan: () => void;
}

export function TodayView({
  tasks,
  schedule,
  todayKey,
  nowMinutes,
  settings,
  onChangeSettings,
  onToggle,
  onUpdate,
  onDelete,
  onCarryOver,
  onReplan,
}: Props) {
  const [mode, setMode] = useState<Mode>("list");

  // 予定時間順に並べ、予定時間のない未完了・完了済みは末尾に
  const timeById = new Map<string, string>();
  const ordered: Task[] = [];
  if (schedule.ok) {
    for (const s of schedule.slots) {
      timeById.set(s.task.id, `${minutesToTime(s.start)}–${minutesToTime(s.end)}`);
      ordered.push(s.task);
    }
  }
  for (const t of tasks) if (!ordered.includes(t) && !t.completed) ordered.push(t);
  for (const t of tasks) if (!ordered.includes(t)) ordered.push(t);

  const incomplete = tasks.filter((t) => !t.completed);
  const next = ordered.find((t) => !t.completed);
  const nextTime = next && timeById.get(next.id);
  const carryAll = () => {
    if (window.confirm(`未完了の ${incomplete.length} 件を明日に持ち越しますか？`)) {
      onCarryOver(incomplete.map((t) => t.id));
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        {tasks.length === 0 ? (
          <span />
        ) : next ? (
          <p className="text-xs text-neutral-500">
            次は <span className="font-medium text-neutral-900">「{next.title}」</span>
            {nextTime && `（${nextTime}）`}
          </p>
        ) : (
          <p className="text-xs text-neutral-500">今日のタスクはすべて完了しました。おつかれさまでした。</p>
        )}
        <ModeToggle value={mode} onChange={setMode} />
      </div>

      {mode === "schedule" ? (
        <ScheduleView
          schedule={schedule}
          settings={settings}
          hasTasks={tasks.length > 0}
          onChangeSettings={onChangeSettings}
          nowMinutes={nowMinutes}
          renderStatus={(slot) => <StatusBadge status={slotStatus(slot.task, todayKey, nowMinutes)} />}
          onReplan={onReplan}
          note="予定時間は自動では動きません。遅れが出たら「今から組み直す」で、未完了のタスクを現在時刻以降に並べ直せます（完了済みはそのまま）。"
        />
      ) : tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm text-neutral-400">
          今日のタスクはありません。
          <br />
          「明日」で明日やることを決めておきましょう。
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {ordered.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                lead={timeById.get(task.id) ?? null}
                status={<StatusBadge status={slotStatus(task, todayKey, nowMinutes)} />}
                overdueFrom={task.targetDate < todayKey ? task.targetDate : undefined}
                onToggle={onToggle}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onCarryOver={(id) => onCarryOver([id])}
              />
            ))}
          </ul>

          {incomplete.length >= 2 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={carryAll}
                className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
              >
                未完了 {incomplete.length} 件をすべて明日に持ち越す
              </button>
            </div>
          )}

          {!schedule.ok && <p className="mt-3 text-xs text-red-600">{schedule.error}（スケジュール表示で活動時間を設定できます）</p>}
        </>
      )}
    </div>
  );
}
