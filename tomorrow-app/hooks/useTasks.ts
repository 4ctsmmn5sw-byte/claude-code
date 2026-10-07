"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, toDateKey } from "@/lib/date";
import { sortByRecommendation } from "@/lib/sort";
import { loadTasks, saveTasks } from "@/lib/storage";
import type { Task, TaskInput } from "@/lib/types";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [today, setToday] = useState<Date | null>(null);
  const [loaded, setLoaded] = useState(false);

  // localStorage と現在日時はブラウザでしか分からないので、マウント後に読み込む
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setTasks(loadTasks());
    setToday(new Date());
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // 日付をまたいで開きっぱなしでも「明日」がずれないよう、タブ復帰時に更新する
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setToday(new Date());
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  useEffect(() => {
    if (loaded) saveTasks(tasks);
  }, [tasks, loaded]);

  const tomorrow = useMemo(() => (today ? addDays(today, 1) : null), [today]);
  const tomorrowKey = tomorrow ? toDateKey(tomorrow) : null;

  const tomorrowTasks = useMemo(
    () => sortByRecommendation(tasks.filter((t) => t.targetDate === tomorrowKey)),
    [tasks, tomorrowKey],
  );

  const addTask = useCallback(
    (input: TaskInput) => {
      if (!tomorrowKey) return;
      setTasks((prev) => [
        ...prev,
        { ...input, id: createId(), completed: false, targetDate: tomorrowKey, createdAt: Date.now() },
      ]);
    },
    [tomorrowKey],
  );

  const updateTask = useCallback((id: string, input: TaskInput) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...input } : t)));
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const completedCount = tomorrowTasks.filter((t) => t.completed).length;

  return {
    loaded,
    today,
    tomorrow,
    tasks: tomorrowTasks,
    completedCount,
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
  };
}
