import type { Priority, Task } from "./types";

const STORAGE_KEY = "tomorrow-tasks:v1";
const PRIORITIES: Priority[] = ["high", "medium", "low"];

function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    PRIORITIES.includes(t.priority as Priority) &&
    typeof t.deadline === "string" &&
    typeof t.estimatedMinutes === "number" &&
    typeof t.completed === "boolean" &&
    typeof t.targetDate === "string" &&
    typeof t.createdAt === "number"
  );
}

export function loadTasks(): Task[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isTask) : [];
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // 容量超過やプライベートモードでは保存できないが、アプリは動作を続ける
  }
}
