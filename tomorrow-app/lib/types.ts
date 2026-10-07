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
  /**
   * 予定時間（0:00 からの分数）。date はその予定の日 "YYYY-MM-DD"。
   * 明日のタスクには明日のスケジュールの結果が保存され、日付が変わるとそのまま今日の予定になる。
   * 時間の経過では動かず、「今から組み直す」などで更新する。date のない旧データは targetDate の日の予定とみなす。
   */
  scheduledSlot?: { start: number; end: number; date?: string };
  /** 実際に完了ボタンを押した日時（ISO 8601）。未完了に戻すと消える */
  completedAt?: string;
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
