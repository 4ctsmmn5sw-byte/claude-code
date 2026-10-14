import { parseAppData, STORAGE_KEY, type LoadResult } from "./storage";
import type { AppData } from "./types";

/**
 * バックアップと復元。
 * - 書き出し：保存データ全体を JSON ファイルにしてダウンロードする
 * - 復元：ファイルを検証してから置き換える。置き換える前の状態は必ずこのブラウザ内に退避する
 * - このブラウザ内の退避データ（スナップショット）は最新 MAX_SNAPSHOTS 件まで残す
 */

export const BACKUP_APP_ID = "asu-no-sekkei";
const BACKUP_PREFIX = `${STORAGE_KEY}:backup:`;
const SNAPSHOT_PREFIX = `${BACKUP_PREFIX}snap-`;
export const MAX_SNAPSHOTS = 10;

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  exportedAt: string;
  schemaVersion: number;
  data: AppData;
}

export function buildBackupFile(data: AppData, now = new Date()): BackupFile {
  return { app: BACKUP_APP_ID, exportedAt: now.toISOString(), schemaVersion: data.schemaVersion, data };
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `asu-no-sekkei-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

export type ParsedBackup =
  | { ok: true; result: LoadResult; exportedAt: string | null }
  | { ok: false; message: string };

/** バックアップファイルを読む。このアプリのファイルか、保存データそのものの JSON を受け付ける */
export function parseBackupFile(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: "JSON として読み込めないファイルです" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, message: "バックアップの形式ではありません" };
  }
  const obj = raw as Record<string, unknown>;
  const isWrapped = obj.app === BACKUP_APP_ID && typeof obj.data === "object" && obj.data !== null;
  const payload = isWrapped ? obj.data : obj;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.tasks) && !Array.isArray(p.fixedEvents) && !Array.isArray(p.goals)) {
    return { ok: false, message: "「明日の設計」のバックアップではありません" };
  }
  return {
    ok: true,
    result: parseAppData(JSON.stringify(payload)),
    exportedAt: isWrapped && typeof obj.exportedAt === "string" ? obj.exportedAt : null,
  };
}

export function summarize(data: AppData) {
  return {
    tasks: data.tasks.length,
    fixedEvents: data.fixedEvents.length,
    goals: data.goals.length,
    goalSteps: data.goalSteps.length,
    workLogs: data.workLogs.length,
  };
}

/* ---------- このブラウザ内の退避データ ---------- */

export interface LocalBackup {
  key: string;
  createdAt: string | null;
  reason: string;
  /** 読み込めた場合の中身 */
  result: LoadResult | null;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** 現在のデータを退避する。容量不足などで失敗したら ok: false（その場合は置き換えを中止すること） */
export function saveSnapshot(data: AppData, reason: string, now = new Date()): { ok: true } | { ok: false; message: string } {
  const s = storage();
  if (!s) return { ok: true }; // サーバー描画・テスト環境では退避先がない
  try {
    s.setItem(`${SNAPSHOT_PREFIX}${now.getTime()}`, JSON.stringify({ reason, createdAt: now.toISOString(), data }));
  } catch {
    return {
      ok: false,
      message: "現在のデータをブラウザ内に退避できなかったため、中止しました。先に「バックアップを書き出す」で保存してください",
    };
  }
  pruneSnapshots(s);
  return { ok: true };
}

function pruneSnapshots(s: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(SNAPSHOT_PREFIX)) keys.push(k);
  }
  keys.sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SNAPSHOTS))) s.removeItem(k);
}

const REASON_LABELS: Record<string, string> = {
  "premigrate-v3": "目標機能を追加する前のデータ（自動）",
};

/** このブラウザ内の退避データの一覧（新しい順） */
export function listLocalBackups(): LocalBackup[] {
  const s = storage();
  if (!s) return [];
  const out: LocalBackup[] = [];
  for (let i = 0; i < s.length; i++) {
    const key = s.key(i);
    if (!key?.startsWith(BACKUP_PREFIX)) continue;
    const json = s.getItem(key);
    const suffix = key.slice(BACKUP_PREFIX.length);
    if (key.startsWith(SNAPSHOT_PREFIX)) {
      try {
        const obj = JSON.parse(json ?? "");
        out.push({ key, createdAt: obj.createdAt ?? null, reason: obj.reason ?? "退避", result: parseAppData(JSON.stringify(obj.data)) });
      } catch {
        out.push({ key, createdAt: null, reason: "読み込めない退避データ", result: null });
      }
    } else {
      // 旧形式：壊れたデータの退避（数字の時刻）や、移行前の元データ
      const ts = /^\d+$/.test(suffix) ? new Date(Number(suffix)).toISOString() : null;
      const parsed = parseAppData(json);
      out.push({
        key,
        createdAt: ts,
        reason: REASON_LABELS[suffix.replace(/^premigrate-v(\d+).*/, "premigrate-v$1")] ?? "読み込みに失敗したときの元データ（自動）",
        result: parsed.warning?.includes("空の状態") ? null : parsed,
      });
    }
  }
  return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export function deleteLocalBackup(key: string) {
  if (!key.startsWith(BACKUP_PREFIX)) return;
  storage()?.removeItem(key);
}
