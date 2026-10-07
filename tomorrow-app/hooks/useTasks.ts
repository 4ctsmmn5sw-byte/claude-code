"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { carryOverTask, returnTaskToToday } from "@/lib/carryover";
import { addDays, toDateKey } from "@/lib/date";
import { sortByRecommendation } from "@/lib/sort";
import { loadPlanDay, loadTasks, savePlanDay, saveTasks } from "@/lib/storage";
import { fillTodaySlots, isTodayTask, replanToday } from "@/lib/todayPlan";
import type { DaySettings, Task, TaskInput } from "@/lib/types";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const currentMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** settings は読み込み完了までは null（今日の予定時間の割り当てを待つため） */
export function useTasks(settings: DaySettings | null) {
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

  // 今日のタスクのうち予定時間がないものに空き時間を割り当てる。
  // 現在時刻は依存に含めないので、時間が経っても予定は動かない。
  useEffect(() => {
    if (!loaded || !settings || !todayKey) return;
    const resetOverdue = loadPlanDay() !== todayKey;
    if (resetOverdue) savePlanDay(todayKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks((prev) => fillTodaySlots(prev, todayKey, settings, currentMinutes(), { resetOverdue }));
  }, [loaded, settings, todayKey, tasks]);

  // 今日: 今日の予定 + 過ぎた日の未完了（持ち越すか完了するまで残す）
  const todayTasks = useMemo(
    () =>
      todayKey
        ? sortByRecommendation(
            tasks.filter((t) => isTodayTask(t, todayKey)),
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

  /**
   * 完了・未完了を切り替える。予定時間（scheduledSlot）は変えず、
   * 完了時は実績として completedAt を記録し、未完了に戻すと消す。
   */
  const toggleTask = useCallback(
    (id: string) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          if (t.completed) {
            const next = { ...t, completed: false };
            delete next.completedAt;
            return next;
          }
          // 過ぎた日のタスクを完了したら今日の完了として扱う（そのままだと今日の画面から消えてしまう）
          const targetDate = todayKey && t.targetDate < todayKey ? todayKey : t.targetDate;
          return { ...t, completed: true, targetDate, completedAt: new Date().toISOString() };
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

  /** 持ち越したタスクを今日に戻す（完了状態は変えない） */
  const returnToToday = useCallback(
    (id: string) => {
      if (!todayKey) return;
      setTasks((prev) => prev.map((t) => (t.id === id ? returnTaskToToday(t, todayKey) : t)));
    },
    [todayKey],
  );

  /** 「今から組み直す」: 未完了タスクだけを現在時刻以降に並べ直す */
  const replan = useCallback(() => {
    if (!todayKey || !settings) return;
    setTasks((prev) => replanToday(prev, todayKey, settings, currentMinutes()));
  }, [todayKey, settings]);

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
    returnToToday,
    replan,
  };
}
