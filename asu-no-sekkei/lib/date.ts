import type { DateKey, Weekday } from "./types";

/**
 * 日付は Asia/Tokyo の暦日を "YYYY-MM-DD" で扱う。
 * 「今日」の判定だけ Intl で Asia/Tokyo を指定し、曜日計算や日付の加減算は
 * 文字列 → UTC の暦計算で行うため、端末のタイムゾーンや夏時間の影響を受けない。
 */
export const TIME_ZONE = "Asia/Tokyo";

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
/** 設定画面での並び（月曜始まり） */
export const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function tokyoParts(now: Date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}` as DateKey,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Asia/Tokyo の今日 */
export function todayKey(now: Date = new Date()): DateKey {
  return tokyoParts(now).date;
}

/** Asia/Tokyo の現在時刻（0:00 からの分） */
export function nowMinutesInTokyo(now: Date = new Date()): number {
  return tokyoParts(now).minutes;
}

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function toUtc(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): DateKey {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = toUtc(key);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function weekdayOf(key: DateKey): Weekday {
  return toUtc(key).getUTCDay() as Weekday;
}

/** "10月15日（木）" */
export function formatDateLabel(key: DateKey): string {
  const [, m, d] = key.split("-").map(Number);
  return `${m}月${d}日（${WEEKDAY_LABELS[weekdayOf(key)]}）`;
}

/** 今日を基準にした相対ラベル（今日・明日・昨日）。該当しなければ null */
export function relativeLabel(key: DateKey, today: DateKey): string | null {
  if (key === today) return "今日";
  if (key === addDays(today, 1)) return "明日";
  if (key === addDays(today, -1)) return "昨日";
  return null;
}
