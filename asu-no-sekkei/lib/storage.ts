import { FIXED_COLORS, TASK_COLORS, DEFAULT_FIXED_COLOR, DEFAULT_TASK_COLOR } from "./colors";
import { isDateKey } from "./date";
import { DAY_MINUTES, DEFAULT_PX_PER_MINUTE, ZOOM_LEVELS } from "./time";
import type { AppData, FixedEvent, Settings, Task, Weekday } from "./types";

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

export function emptyData(): AppData {
  return { schemaVersion: 2, tasks: [], fixedEvents: [], settings: { ...DEFAULT_SETTINGS } };
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
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
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
  const dropped = rawTasks.length - tasks.length + (rawFixed.length - fixedEvents.length);
  return {
    data: { schemaVersion: 2, tasks, fixedEvents, settings },
    warning: dropped > 0 ? `読み込めなかったデータが${dropped}件あったため、除外しました` : null,
  };
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
    return result;
  }

  save(data: AppData): void {
    window.localStorage.setItem(this.key, JSON.stringify(data));
  }
}
