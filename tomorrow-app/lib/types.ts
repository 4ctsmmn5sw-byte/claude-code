export type Priority = "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  /** "HH:mm"。空文字なら締切なし */
  deadline: string;
  estimatedMinutes: number;
  completed: boolean;
  /** "YYYY-MM-DD"。このタスクを実行する日（＝登録時の明日） */
  targetDate: string;
  createdAt: number;
  /** 前日以前から持ち越された場合、最初に予定していた日 "YYYY-MM-DD" */
  carriedOverFrom?: string;
  /** 今日のタスクを完了したときの予定時間（0:00 からの分数）。今日のスケジュールで固定表示する */
  scheduledSlot?: { start: number; end: number };
}

export type TaskInput = Pick<Task, "title" | "priority" | "deadline" | "estimatedMinutes">;

/** 明日の活動可能時間（"HH:mm"） */
export interface DaySettings {
  dayStart: string;
  dayEnd: string;
}

export const DEFAULT_DAY_SETTINGS: DaySettings = { dayStart: "09:00", dayEnd: "22:00" };

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};
