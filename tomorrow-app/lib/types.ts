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
}

export type TaskInput = Pick<Task, "title" | "priority" | "deadline" | "estimatedMinutes">;

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};
