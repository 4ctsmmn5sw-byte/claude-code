"use client";

import { minutesToTime } from "@/lib/date";
import type { Schedule } from "@/lib/schedule";
import type { Task, TaskInput } from "@/lib/types";
import { TaskItem } from "./TaskItem";

interface Props {
  tasks: Task[];
  schedule: Schedule;
  todayKey: string;
  onToggle: (id: string) => void;
  onUpdate: (id: string, input: TaskInput) => void;
  onDelete: (id: string) => void;
  onCarryOver: (ids: string[]) => void;
}

export function TodayView({ tasks, schedule, todayKey, onToggle, onUpdate, onDelete, onCarryOver }: Props) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm text-neutral-400">
        今日のタスクはありません。
        <br />
        「明日」で明日やることを決めておきましょう。
      </p>
    );
  }

  // 予定時間順に並べ、活動時間に入りきらないものは末尾に
  const timeById = new Map<string, string>();
  const ordered: Task[] = [];
  if (schedule.ok) {
    for (const s of schedule.slots) {
      timeById.set(s.task.id, `${minutesToTime(s.start)}–${minutesToTime(s.end)}`);
      ordered.push(s.task);
    }
    for (const t of schedule.overflow) {
      timeById.set(t.id, "時間外");
      ordered.push(t);
    }
  } else {
    ordered.push(...tasks);
  }

  const incomplete = tasks.filter((t) => !t.completed);
  const next = ordered.find((t) => !t.completed);
  const carryAll = () => {
    if (window.confirm(`未完了の ${incomplete.length} 件を明日に持ち越しますか？`)) {
      onCarryOver(incomplete.map((t) => t.id));
    }
  };

  return (
    <div>
      {next ? (
        <p className="mb-3 text-xs text-neutral-500">
          次は <span className="font-medium text-neutral-900">「{next.title}」</span>
          {timeById.get(next.id) && timeById.get(next.id) !== "時間外" && `（${timeById.get(next.id)}）`}
        </p>
      ) : (
        <p className="mb-3 text-xs text-neutral-500">今日のタスクはすべて完了しました。おつかれさまでした。</p>
      )}

      <ul className="space-y-2">
        {ordered.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            lead={timeById.get(task.id) ?? null}
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

      {!schedule.ok && <p className="mt-3 text-xs text-red-600">{schedule.error}（「明日」のスケジュールで活動時間を設定できます）</p>}
    </div>
  );
}
