import { FIXED_COLORS, TASK_COLORS, DEFAULT_FIXED_COLOR, DEFAULT_TASK_COLOR } from "./colors";
import { isDateKey } from "./date";
import { DAY_MINUTES, DEFAULT_PX_PER_MINUTE, ZOOM_LEVELS } from "./time";
import type {
  AppData,
  FixedEvent,
  Goal,
  GoalPriority,
  GoalStatus,
  GoalStep,
  Settings,
  StepStatus,
  Task,
  Weekday,
  WorkLog,
} from "./types";

/**
 * 保存先の抽象。いまは localStorage 実装だけだが、クラウド保存に置き換える場合は
 * 同じ形の Repository を実装して store に渡せばよい（データ構造は AppData のまま）。
 */
export interface Repository {
  load(): LoadResult;
  save(data: AppData): void;
}

export interface LoadResult {
  data: AppData;
  /** 読み込みで問題があった場合の利用者向けメッセージ */
  warning: string | null;
}

export const STORAGE_KEY = "asu-no-sekkei:v1";

export const DEFAULT_SETTINGS: Settings = { snapMinutes: 5, pxPerMinute: DEFAULT_PX_PER_MINUTE };

export const SCHEMA_VERSION = 3;

export function emptyData(): AppData {
  return {
    schemaVersion: 3,
    tasks: [],
    fixedEvents: [],
    settings: { ...DEFAULT_SETTINGS },
    goals: [],
    goalSteps: [],
    workLogs: [],
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);

function sanitizeTask(raw: unknown): Task | null {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.title !== "string") return null;
  const durationMin = isInt(raw.durationMin) && raw.durationMin >= 1 && raw.durationMin <= DAY_MINUTES ? raw.durationMin : 30;
  let date = isDateKey(raw.date) ? raw.date : null;
  let startMin = isInt(raw.startMin) && raw.startMin >= 0 && raw.startMin + durationMin <= DAY_MINUTES ? raw.startMin : null;
  // 片方だけ欠けている配置は未配置に戻す
  if (date === null || startMin === null) {
    date = null;
    startMin = null;
  }
  const now = new Date().toISOString();
  return {
    id: raw.id,
    title: raw.title,
    durationMin,
    color: TASK_COLORS.some((c) => c.key === raw.color) ? (raw.color as string) : DEFAULT_TASK_COLOR,
    done: raw.done === true,
    date,
    startMin,
    goalId: typeof raw.goalId === "string" ? raw.goalId : null,
    stepId: typeof raw.stepId === "string" ? raw.stepId : null,
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
}

const GOAL_STATUSES: GoalStatus[] = ["wish", "active", "paused", "dropped"];
const PRIORITIES: GoalPriority[] = ["high", "medium", "low"];
const STEP_STATUSES: StepStatus[] = ["todo", "doing", "done", "skipped"];
/** 目標・工程の想定時間の上限（分）。1 万時間 */
export const MAX_ESTIMATE_MINUTES = 600_000;

const optMinutes = (v: unknown, max = MAX_ESTIMATE_MINUTES) => (isInt(v) && v >= 1 && v <= max ? v : null);

function sanitizeGoal(raw: unknown): Goal | null {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.title !== "string") return null;
  const now = new Date().toISOString();
  return {
    id: raw.id,
    title: raw.title,
    description: str(raw.description, ""),
    successCriteria: str(raw.successCriteria, ""),
    deadline: isDateKey(raw.deadline) ? raw.deadline : null,
    priority: PRIORITIES.includes(raw.priority as GoalPriority) ? (raw.priority as GoalPriority) : "medium",
    estimatedMinutes: optMinutes(raw.estimatedMinutes),
    category: str(raw.category, ""),
    status: GOAL_STATUSES.includes(raw.status as GoalStatus) ? (raw.status as GoalStatus) : "wish",
    achievedAt: typeof raw.achievedAt === "string" ? raw.achievedAt : null,
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
}

function sanitizeStep(raw: unknown): GoalStep | null {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.goalId !== "string" || typeof raw.title !== "string") return null;
  const now = new Date().toISOString();
  return {
    id: raw.id,
    goalId: raw.goalId,
    title: raw.title,
    note: str(raw.note, ""),
    estimatedMinutes: optMinutes(raw.estimatedMinutes),
    status: STEP_STATUSES.includes(raw.status as StepStatus) ? (raw.status as StepStatus) : "todo",
    order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : 0,
    dependsOn: Array.isArray(raw.dependsOn) ? [...new Set(raw.dependsOn.filter((d): d is string => typeof d === "string"))] : [],
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
}

function sanitizeLog(raw: unknown): WorkLog | null {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.goalId !== "string") return null;
  if (!isDateKey(raw.date) || !isInt(raw.minutes) || raw.minutes < 1 || raw.minutes > DAY_MINUTES) return null;
  return {
    id: raw.id,
    goalId: raw.goalId,
    stepId: typeof raw.stepId === "string" ? raw.stepId : null,
    taskId: typeof raw.taskId === "string" ? raw.taskId : null,
    date: raw.date,
    minutes: raw.minutes,
    note: str(raw.note, ""),
    createdAt: str(raw.createdAt, new Date().toISOString()),
  };
}

function sanitizeFixed(raw: unknown): FixedEvent | null {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.title !== "string") return null;
  if (!isInt(raw.startMin) || !isInt(raw.endMin)) return null;
  if (raw.startMin < 0 || raw.endMin > DAY_MINUTES || raw.endMin <= raw.startMin) return null;
  const weekdays = Array.isArray(raw.weekdays)
    ? [...new Set(raw.weekdays.filter((w): w is Weekday => isInt(w) && w >= 0 && w <= 6))].sort()
    : [];
  if (weekdays.length === 0) return null;
  const now = new Date().toISOString();
  // v1 には適用期間・休みの日がないので、制限なし・休みなしとして補う
  let validFrom = isDateKey(raw.validFrom) ? raw.validFrom : null;
  let validTo = isDateKey(raw.validTo) ? raw.validTo : null;
  if (validFrom && validTo && validFrom > validTo) [validFrom, validTo] = [validTo, validFrom];
  const skipDates = Array.isArray(raw.skipDates) ? [...new Set(raw.skipDates.filter(isDateKey))].sort() : [];
  return {
    id: raw.id,
    title: raw.title,
    weekdays,
    startMin: raw.startMin,
    endMin: raw.endMin,
    color: FIXED_COLORS.some((c) => c.key === raw.color) ? (raw.color as string) : DEFAULT_FIXED_COLOR,
    validFrom,
    validTo,
    skipDates,
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
}

/**
 * 保存データを検証し、壊れた項目だけを捨てて残りを使う。
 * 全体が読めない場合でも例外は投げずに空データを返す。
 */
export function parseAppData(json: string | null): LoadResult {
  if (json === null) return { data: emptyData(), warning: null };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { data: emptyData(), warning: "保存データを読み込めなかったため、空の状態で開始しました（元のデータは退避済みです）" };
  }
  if (!isObj(raw)) {
    return { data: emptyData(), warning: "保存データの形式が正しくないため、空の状態で開始しました（元のデータは退避済みです）" };
  }
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const rawFixed = Array.isArray(raw.fixedEvents) ? raw.fixedEvents : [];
  const tasks = rawTasks.map(sanitizeTask).filter((t): t is Task => t !== null);
  const fixedEvents = rawFixed.map(sanitizeFixed).filter((e): e is FixedEvent => e !== null);
  const s = isObj(raw.settings) ? raw.settings : {};
  const settings: Settings = {
    snapMinutes: s.snapMinutes === 1 ? 1 : 5,
    pxPerMinute: (ZOOM_LEVELS as readonly number[]).includes(s.pxPerMinute as number)
      ? (s.pxPerMinute as number)
      : DEFAULT_PX_PER_MINUTE,
  };
  // v3 で追加した目標・工程・実績（v2 以前のデータには無いので空になる）
  const rawGoals = Array.isArray(raw.goals) ? raw.goals : [];
  const rawSteps = Array.isArray(raw.goalSteps) ? raw.goalSteps : [];
  const rawLogs = Array.isArray(raw.workLogs) ? raw.workLogs : [];
  const goals = rawGoals.map(sanitizeGoal).filter((g): g is Goal => g !== null);
  const goalIds = new Set(goals.map((g) => g.id));
  // 目標が見つからない工程・実績は使えないので除く
  const goalSteps = rawSteps
    .map(sanitizeStep)
    .filter((st): st is GoalStep => st !== null && goalIds.has(st.goalId));
  const stepById = new Map(goalSteps.map((st) => [st.id, st]));
  for (const st of goalSteps) {
    st.dependsOn = st.dependsOn.filter((d) => d !== st.id && stepById.get(d)?.goalId === st.goalId);
  }
  const workLogs = rawLogs
    .map(sanitizeLog)
    .filter((l): l is WorkLog => l !== null && goalIds.has(l.goalId))
    .map((l) => (l.stepId && !stepById.has(l.stepId) ? { ...l, stepId: null } : l));
  // タスクの紐づけ先が消えていたら、タスクは残して紐づけだけ外す
  for (const t of tasks) {
    if (t.goalId && !goalIds.has(t.goalId)) t.goalId = null;
    if (t.stepId && (!stepById.has(t.stepId) || stepById.get(t.stepId)!.goalId !== t.goalId)) t.stepId = null;
  }

  const dropped =
    rawTasks.length - tasks.length +
    (rawFixed.length - fixedEvents.length) +
    (rawGoals.length - goals.length) +
    (rawSteps.length - goalSteps.length) +
    (rawLogs.length - workLogs.length);
  return {
    data: { schemaVersion: 3, tasks, fixedEvents, settings, goals, goalSteps, workLogs },
    warning: dropped > 0 ? `読み込めなかったデータが${dropped}件あったため、除外しました` : null,
  };
}

/** 保存データの形式の版（読めない場合は null） */
export function rawSchemaVersion(json: string | null): number | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json);
    return isObj(raw) && typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1;
  } catch {
    return null;
  }
}

export class LocalStorageRepository implements Repository {
  constructor(private readonly key: string = STORAGE_KEY) {}

  load(): LoadResult {
    let json: string | null;
    try {
      json = window.localStorage.getItem(this.key);
    } catch {
      return { data: emptyData(), warning: "ブラウザの保存領域にアクセスできません。変更は保存されません" };
    }
    const result = parseAppData(json);
    if (result.warning && json !== null) {
      // 壊れたデータを上書きで失わないよう退避しておく
      try {
        window.localStorage.setItem(`${this.key}:backup:${Date.now()}`, json);
      } catch {
        /* 退避できなくても画面は続行する */
      }
    }
    // 古い形式から変換する前の元データを、一度だけそのまま退避しておく
    const version = rawSchemaVersion(json);
    if (json !== null && version !== null && version < SCHEMA_VERSION) {
      const key = `${this.key}:backup:premigrate-v${SCHEMA_VERSION}`;
      try {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, json);
      } catch {
        /* 退避できなくても画面は続行する */
      }
    }
    return result;
  }

  save(data: AppData): void {
    window.localStorage.setItem(this.key, JSON.stringify(data));
  }
}
