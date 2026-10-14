/**
 * アプリ全体のデータ型。
 * 時刻はすべて「その日の 0:00 からの経過分」（0〜1440 の整数）に正規化する。
 * 日付は Asia/Tokyo 基準の "YYYY-MM-DD" 文字列で扱う。
 * どの型も JSON にそのまま直列化でき、将来クラウド保存へ移しても形を変えずに済むようにしている。
 */

/** "YYYY-MM-DD"（Asia/Tokyo の暦日） */
export type DateKey = string;

/** 0=日, 1=月, … 6=土（Date#getDay と同じ並び） */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Task {
  id: string;
  title: string;
  /** 予定所要時間（分）。配置済みのときは表示上の長さでもある */
  durationMin: number;
  /** カラーキー（lib/colors.ts の TASK_COLORS） */
  color: string;
  done: boolean;
  /** 配置日。未配置なら null */
  date: DateKey | null;
  /** 開始時刻（分）。未配置なら null */
  startMin: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 曜日ごとの固定予定。日付ごとにコピーせず「規則」として 1 件だけ保存し、
 * 表示する日の曜日に一致するものをその場で展開する。
 */
export interface FixedEvent {
  id: string;
  title: string;
  weekdays: Weekday[];
  startMin: number;
  endMin: number;
  /** カラーキー（lib/colors.ts の FIXED_COLORS） */
  color: string;
  /** 適用開始日（この日を含む）。null なら制限なし */
  validFrom: DateKey | null;
  /** 適用終了日（この日を含む）。null なら制限なし */
  validTo: DateKey | null;
  /**
   * 「この日だけ休み」にした日付。繰り返し設定そのものは変えず、例外日だけを持つ
   * （個別の日の変更が毎週の設定全体に影響しないようにするため）
   */
  skipDates: DateKey[];
  createdAt: string;
  updatedAt: string;
}

export type SnapMinutes = 1 | 5;

export interface Settings {
  /** ドラッグ・伸縮時の刻み（分） */
  snapMinutes: SnapMinutes;
  /** タイムラインの表示倍率（1 分あたりの px）。lib/time.ts の ZOOM_LEVELS のいずれか */
  pxPerMinute: number;
}

/** 保存単位。schemaVersion で将来の移行に備える（v1 → v2 は読み込み時に自動変換） */
export interface AppData {
  schemaVersion: 2;
  tasks: Task[];
  fixedEvents: FixedEvent[];
  settings: Settings;
}

/** タイムライン上に並ぶ 1 区間（タスク・固定予定の共通形） */
export interface Interval {
  id: string;
  kind: "task" | "fixed";
  title: string;
  startMin: number;
  endMin: number;
}
