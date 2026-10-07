"use client";

import { Header } from "@/components/Header";
import { SummaryCard } from "@/components/SummaryCard";
import { TaskForm } from "@/components/TaskForm";
import { TaskList } from "@/components/TaskList";
import { useTasks } from "@/hooks/useTasks";

export default function Home() {
  const { loaded, today, tomorrow, tasks, completedCount, addTask, updateTask, toggleTask, deleteTask } = useTasks();
  const firstTask = tasks.find((t) => !t.completed);

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
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-900">明日のタスク</h2>
          <span className="text-xs text-neutral-400">おすすめ順</span>
        </div>
        {firstTask && (
          <p className="mb-3 text-xs text-neutral-500">
            まずは <span className="font-medium text-neutral-900">「{firstTask.title}」</span> から始めましょう
          </p>
        )}
        {loaded ? (
          <TaskList tasks={tasks} onToggle={toggleTask} onUpdate={updateTask} onDelete={deleteTask} />
        ) : (
          <div className="h-24 animate-pulse rounded-xl bg-neutral-100" />
        )}
      </section>
    </main>
  );
}
