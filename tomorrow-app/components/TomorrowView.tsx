"use client";

import { useState } from "react";
import type { Schedule } from "@/lib/schedule";
import type { DaySettings, Task, TaskInput } from "@/lib/types";
import { ScheduleView } from "./ScheduleView";
import { TaskList } from "./TaskList";

type Mode = "list" | "schedule";

const MODES: { value: Mode; label: string }[] = [
  { value: "list", label: "一覧" },
  { value: "schedule", label: "スケジュール" },
];

interface Props {
  tasks: Task[];
  schedule: Schedule;
  settings: DaySettings;
  onChangeSettings: (settings: DaySettings) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, input: TaskInput) => void;
  onDelete: (id: string) => void;
}

export function TomorrowView({ tasks, schedule, settings, onChangeSettings, onToggle, onUpdate, onDelete }: Props) {
  const [mode, setMode] = useState<Mode>("list");

  // 最初に取り組むタスク: スケジュールの先頭の未完了タスク（組めない場合はおすすめ順の先頭）
  const firstTask =
    (schedule.ok ? schedule.slots.find((s) => !s.task.completed)?.task : undefined) ??
    tasks.find((t) => !t.completed);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        {firstTask ? (
          <p className="text-xs text-neutral-500">
            まずは <span className="font-medium text-neutral-900">「{firstTask.title}」</span> から始めましょう
          </p>
        ) : (
          <span />
        )}
        <div className="inline-flex shrink-0 rounded-md border border-neutral-200 bg-white p-0.5" role="tablist" aria-label="表示切り替え">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="tab"
              aria-selected={mode === m.value}
              onClick={() => setMode(m.value)}
              className={`rounded px-3 py-1 text-xs transition ${
                mode === m.value ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "list" ? (
        <>
          <p className="mb-2 text-right text-xs text-neutral-400">おすすめ順</p>
          <TaskList tasks={tasks} onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} />
        </>
      ) : (
        <ScheduleView
          schedule={schedule}
          settings={settings}
          hasTasks={tasks.length > 0}
          onChangeSettings={onChangeSettings}
        />
      )}
    </div>
  );
}
