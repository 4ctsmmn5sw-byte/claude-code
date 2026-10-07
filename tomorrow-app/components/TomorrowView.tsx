"use client";

import { useState } from "react";
import type { Schedule } from "@/lib/schedule";
import type { DaySettings, Task, TaskInput } from "@/lib/types";
import { ModeToggle, type Mode } from "./ModeToggle";
import { ScheduleView } from "./ScheduleView";
import { TaskList } from "./TaskList";

interface Props {
  tasks: Task[];
  schedule: Schedule;
  settings: DaySettings;
  onChangeSettings: (settings: DaySettings) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, input: TaskInput) => void;
  onDelete: (id: string) => void;
  onReturnToToday: (id: string) => void;
}

export function TomorrowView({ tasks, schedule, settings, onChangeSettings, onToggle, onUpdate, onDelete, onReturnToToday }: Props) {
  const [mode, setMode] = useState<Mode>("list");

  // 最初に取り組むタスク: スケジュールの先頭の未完了タスク（組めない場合はおすすめ順の先頭）
  const firstTask =
    (schedule.ok ? schedule.slots.find((s) => !s.task.completed)?.task : undefined) ??
    tasks.find((t) => !t.completed);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        {firstTask ? (
          <p className="min-w-0 [overflow-wrap:anywhere] text-xs text-neutral-500">
            まずは <span className="font-medium text-neutral-900">「{firstTask.title}」</span> から始めましょう
          </p>
        ) : (
          <span />
        )}
        <ModeToggle value={mode} onChange={setMode} />
      </div>

      {mode === "list" ? (
        <>
          <p className="mb-2 text-right text-xs text-neutral-400">おすすめ順</p>
          <TaskList tasks={tasks} onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} onReturnToToday={onReturnToToday} />
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
