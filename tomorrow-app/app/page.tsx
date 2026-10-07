"use client";

import { useMemo, useState } from "react";
import { DayTabs, type Day } from "@/components/DayTabs";
import { Header } from "@/components/Header";
import { SummaryCard } from "@/components/SummaryCard";
import { TaskForm } from "@/components/TaskForm";
import { TodayView } from "@/components/TodayView";
import { TomorrowView } from "@/components/TomorrowView";
import { useDaySettings } from "@/hooks/useDaySettings";
import { useNow } from "@/hooks/useNow";
import { useTasks } from "@/hooks/useTasks";
import { formatDateKeyShort } from "@/lib/date";
import { buildSchedule, buildTodaySchedule } from "@/lib/schedule";

/** この時刻以降に開いたら「明日」の画面から表示する */
const EVENING_HOUR = 18;

export default function Home() {
  const {
    loaded,
    today,
    tomorrow,
    todayKey,
    tomorrowKey,
    todayTasks,
    tomorrowTasks,
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
    carryOver,
    returnToToday,
  } = useTasks();
  const { settings, setSettings } = useDaySettings();
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);

  // 未選択なら時間帯で決める（日中は今日、夜は明日の計画）
  const day: Day = selectedDay ?? (today && today.getHours() >= EVENING_HOUR ? "tomorrow" : "today");
  const tasks = day === "today" ? todayTasks : tomorrowTasks;
  const dayKey = day === "today" ? todayKey : tomorrowKey;

  const now = useNow();
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : 0;
  const todaySchedule = useMemo(
    () => buildTodaySchedule(todayTasks, settings, nowMinutes),
    [todayTasks, settings, nowMinutes],
  );
  const tomorrowSchedule = useMemo(() => buildSchedule(tomorrowTasks, settings), [tomorrowTasks, settings]);

  const handlers = { onUpdate: updateTask, onDelete: deleteTask };
  // 今日のタスクを完了するときは、その時点の予定時間を記録して枠を固定する
  const toggleTodayTask = (id: string) => {
    const slot = todaySchedule.ok ? todaySchedule.slots.find((s) => s.task.id === id) : undefined;
    toggleTask(id, slot && { start: slot.start, end: slot.end });
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-20 sm:px-6">
      <Header />

      <DayTabs
        value={day}
        onChange={setSelectedDay}
        labels={{
          today: todayKey ? formatDateKeyShort(todayKey) : "",
          tomorrow: tomorrowKey ? formatDateKeyShort(tomorrowKey) : "",
        }}
      />

      <SummaryCard
        day={day}
        today={today}
        tomorrow={tomorrow}
        completed={tasks.filter((t) => t.completed).length}
        total={tasks.length}
      />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-neutral-900">
          {day === "today" ? "今日" : "明日"}のタスクを追加
        </h2>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <TaskForm
            submitLabel="追加"
            placeholder={day === "today" ? "今日やること" : "明日やること"}
            disabled={!loaded || !dayKey}
            onSubmit={(input) => dayKey && addTask(input, dayKey)}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-neutral-900">{day === "today" ? "今日" : "明日"}のタスク</h2>
        {!loaded || !todayKey || !now ? (
          <div className="h-24 animate-pulse rounded-xl bg-neutral-100" />
        ) : day === "today" ? (
          <TodayView
            tasks={todayTasks}
            schedule={todaySchedule}
            todayKey={todayKey}
            nowMinutes={nowMinutes}
            settings={settings}
            onChangeSettings={setSettings}
            onToggle={toggleTodayTask}
            onCarryOver={carryOver}
            {...handlers}
          />
        ) : (
          <TomorrowView
            tasks={tomorrowTasks}
            schedule={tomorrowSchedule}
            settings={settings}
            onChangeSettings={setSettings}
            onToggle={toggleTask}
            onReturnToToday={returnToToday}
            {...handlers}
          />
        )}
      </section>
    </main>
  );
}
