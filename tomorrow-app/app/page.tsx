"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { ScheduleView } from "@/components/ScheduleView";
import { SummaryCard } from "@/components/SummaryCard";
import { TaskForm } from "@/components/TaskForm";
import { TaskList } from "@/components/TaskList";
import { useDaySettings } from "@/hooks/useDaySettings";
import { useTasks } from "@/hooks/useTasks";
import { buildSchedule } from "@/lib/schedule";

type View = "list" | "schedule";

const VIEWS: { value: View; label: string }[] = [
  { value: "list", label: "一覧" },
  { value: "schedule", label: "スケジュール" },
];

export default function Home() {
  const { loaded, today, tomorrow, tasks, completedCount, addTask, updateTask, toggleTask, deleteTask } = useTasks();
  const { settings, setSettings } = useDaySettings();
  const [view, setView] = useState<View>("list");

  const schedule = useMemo(() => buildSchedule(tasks, settings), [tasks, settings]);
  // 最初に取り組むタスク: スケジュールの先頭の未完了タスク（組めない場合はおすすめ順の先頭）
  const firstTask =
    (schedule.ok ? schedule.slots.find((s) => !s.task.completed)?.task : undefined) ??
    tasks.find((t) => !t.completed);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-20 sm:px-6">
      <Header />

      <SummaryCard today={today} tomorrow={tomorrow} completed={completedCount} total={tasks.length} />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-neutral-900">タスクを追加</h2>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <TaskForm submitLabel="追加" disabled={!loaded} onSubmit={addTask} />
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-900">明日のタスク</h2>
          <div className="inline-flex rounded-md border border-neutral-200 bg-white p-0.5" role="tablist" aria-label="表示切り替え">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                role="tab"
                aria-selected={view === v.value}
                onClick={() => setView(v.value)}
                className={`rounded px-3 py-1 text-xs transition ${
                  view === v.value ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        {firstTask && (
          <p className="mb-3 text-xs text-neutral-500">
            まずは <span className="font-medium text-neutral-900">「{firstTask.title}」</span> から始めましょう
          </p>
        )}
        {!loaded ? (
          <div className="h-24 animate-pulse rounded-xl bg-neutral-100" />
        ) : view === "list" ? (
          <>
            <p className="mb-2 text-right text-xs text-neutral-400">おすすめ順</p>
            <TaskList tasks={tasks} onToggle={toggleTask} onUpdate={updateTask} onDelete={deleteTask} />
          </>
        ) : (
          <ScheduleView
            schedule={schedule}
            settings={settings}
            hasTasks={tasks.length > 0}
            onChangeSettings={setSettings}
          />
        )}
      </section>
    </main>
  );
}
