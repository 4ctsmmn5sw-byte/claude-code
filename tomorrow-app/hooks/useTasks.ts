"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { carryOverTask } from "@/lib/carryover";
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

  // 日付をまたいで開きっぱなしでも「今日」「明日」がずれないよう、タブ復帰時に更新する
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
  const todayKey = today ? toDateKey(today) : null;
  const tomorrowKey = tomorrow ? toDateKey(tomorrow) : null;

  // 今日: 今日の予定 + 過ぎた日の未完了（持ち越すか完了するまで残す）
  const todayTasks = useMemo(
    () =>
      todayKey
        ? sortByRecommendation(
            tasks.filter((t) => t.targetDate === todayKey || (t.targetDate < todayKey && !t.completed)),
          )
        : [],
    [tasks, todayKey],
  );

  const tomorrowTasks = useMemo(
    () => sortByRecommendation(tasks.filter((t) => t.targetDate === tomorrowKey)),
    [tasks, tomorrowKey],
  );

  const addTask = useCallback((input: TaskInput, targetDate: string) => {
    setTasks((prev) => [
      ...prev,
      { ...input, id: createId(), completed: false, targetDate, createdAt: Date.now() },
    ]);
  }, []);

  const updateTask = useCallback((id: string, input: TaskInput) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...input } : t)));
  }, []);

  const toggleTask = useCallback(
    (id: string) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          // 過ぎた日のタスクを完了したら今日の完了として扱う（そのままだと今日の画面から消えてしまう）
          const targetDate = !t.completed && todayKey && t.targetDate < todayKey ? todayKey : t.targetDate;
          return { ...t, completed: !t.completed, targetDate };
        }),
      );
    },
    [todayKey],
  );

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /** 未完了タスクを明日に持ち越す（完了済みは対象外） */
  const carryOver = useCallback(
    (ids: string[]) => {
      if (!tomorrowKey) return;
      const targets = new Set(ids);
      setTasks((prev) =>
        prev.map((t) => (targets.has(t.id) && !t.completed ? carryOverTask(t, tomorrowKey) : t)),
      );
    },
    [tomorrowKey],
  );

  return {
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
  };
}
