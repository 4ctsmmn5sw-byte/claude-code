import { revertLegacyAutoCarryOver } from "./carryover";
import { DEFAULT_DAY_SETTINGS, type DaySettings, type Priority, type Task } from "./types";

const STORAGE_KEY = "tomorrow-tasks:v1";
const SETTINGS_KEY = "tomorrow-settings:v1";
const MIGRATIONS_KEY = "tomorrow-migrations:v1";
const MIGRATION_MANUAL_CARRY_OVER = "manual-carry-over";
const PRIORITIES: Priority[] = ["high", "medium", "low"];

function isSlot(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.start === "number" && typeof s.end === "number" && (s.date === undefined || typeof s.date === "string")
  );
}

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
    typeof t.createdAt === "number" &&
    (t.carriedOverFrom === undefined || typeof t.carriedOverFrom === "string") &&
    (t.scheduledSlot === undefined || isSlot(t.scheduledSlot)) &&
    (t.completedAt === undefined || typeof t.completedAt === "string")
  );
}

export function loadTasks(): Task[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const tasks = Array.isArray(parsed) ? parsed.filter(isTask) : [];
    return applyMigrations(tasks);
  } catch {
    return [];
  }
}

/** 保存データの一度きりの移行。実行済みの移行は MIGRATIONS_KEY に記録する */
function applyMigrations(tasks: Task[]): Task[] {
  let done: string[] = [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(MIGRATIONS_KEY) ?? "[]");
    if (Array.isArray(parsed)) done = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // 壊れた記録は未実行として扱う
  }
  if (done.includes(MIGRATION_MANUAL_CARRY_OVER)) return tasks;

  // 先に記録する。記録できないまま移行すると、次回また移行が走り手動の持ち越しまで戻してしまう
  try {
    window.localStorage.setItem(MIGRATIONS_KEY, JSON.stringify([...done, MIGRATION_MANUAL_CARRY_OVER]));
  } catch {
    return tasks;
  }
  const migrated = revertLegacyAutoCarryOver(tasks);
  saveTasks(migrated);
  return migrated;
}

export function saveTasks(tasks: Task[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // 容量超過やプライベートモードでは保存できないが、アプリは動作を続ける
  }
}

export function loadDaySettings(): DaySettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_DAY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DaySettings> | null;
    return {
      dayStart: typeof parsed?.dayStart === "string" ? parsed.dayStart : DEFAULT_DAY_SETTINGS.dayStart,
      dayEnd: typeof parsed?.dayEnd === "string" ? parsed.dayEnd : DEFAULT_DAY_SETTINGS.dayEnd,
    };
  } catch {
    return DEFAULT_DAY_SETTINGS;
  }
}

export function saveDaySettings(settings: DaySettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても画面上の設定は有効なまま
  }
}
