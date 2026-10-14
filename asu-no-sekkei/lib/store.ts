"use client";

import { useSyncExternalStore } from "react";
import { checkPlacement } from "./schedule";
import { DAY_MINUTES } from "./time";
import { emptyData, LocalStorageRepository, STORAGE_KEY, type Repository } from "./storage";
import type { AppData, DateKey, FixedEvent, Settings, Task } from "./types";

/**
 * アプリの状態を 1 か所に持ち、変更のたびに Repository へ保存する外部ストア。
 * React からは useSyncExternalStore で購読する。サーバー描画時は null（読み込み前）を返す。
 * 配置・時刻変更はここで必ず checkPlacement を通すので、UI 側の判定が漏れても重複は保存されない。
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

type Listener = () => void;

interface StoreState {
  data: AppData;
  warning: string | null;
}

let repository: Repository | null = null;
let state: StoreState | null = null;
const listeners = new Set<Listener>();

function ensureLoaded(): StoreState {
  if (state === null) {
    repository ??= new LocalStorageRepository();
    const { data, warning } = repository.load();
    state = { data, warning };
  }
  return state;
}

function emit() {
  for (const l of listeners) l();
}

function commit(next: AppData) {
  const current = ensureLoaded();
  let warning = current.warning;
  try {
    repository?.save(next);
  } catch {
    warning = "保存に失敗しました（保存容量の不足やプライベートモードの可能性があります）";
  }
  state = { data: next, warning };
  emit();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  // 別タブでの変更を取り込む
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && repository) {
      state = { ...repository.load() };
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = () => ensureLoaded();
const getServerSnapshot = () => null;

/** 読み込み前（サーバー描画・初回 hydration）は null */
export function useAppStore(): StoreState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function data(): AppData {
  return ensureLoaded().data;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const nowIso = () => new Date().toISOString();

function updateTask(id: string, patch: Partial<Task>) {
  const d = data();
  commit({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: nowIso() } : t)) });
}

function validDuration(min: number): boolean {
  return Number.isInteger(min) && min >= 1 && min <= DAY_MINUTES;
}

export type FixedEventInput = Omit<FixedEvent, "id" | "createdAt" | "updatedAt" | "skipDates" | "validFrom" | "validTo"> & {
  id?: string;
  validFrom?: DateKey | null;
  validTo?: DateKey | null;
};

/** 固定予定の入力を検証して保存用の形にする（設定画面・タスクからの変換で共通） */
function buildFixedEvent(
  input: FixedEventInput,
  existing: FixedEvent | undefined,
): { ok: true; event: FixedEvent } | { ok: false; message: string } {
  const title = input.title.trim();
  if (!title) return { ok: false, message: "予定名を入力してください" };
  if (input.weekdays.length === 0) return { ok: false, message: "曜日を1つ以上選んでください" };
  if (
    !Number.isInteger(input.startMin) ||
    !Number.isInteger(input.endMin) ||
    input.startMin < 0 ||
    input.endMin > DAY_MINUTES ||
    input.endMin <= input.startMin
  ) {
    return { ok: false, message: "終了時刻は開始時刻より後にしてください（0:00〜24:00）" };
  }
  const validFrom = input.validFrom ?? null;
  const validTo = input.validTo ?? null;
  if (validFrom && validTo && validFrom > validTo) {
    return { ok: false, message: "終了日は開始日以降にしてください" };
  }
  const now = nowIso();
  return {
    ok: true,
    event: {
      id: existing?.id ?? newId(),
      title,
      weekdays: [...new Set(input.weekdays)].sort((a, b) => a - b),
      startMin: input.startMin,
      endMin: input.endMin,
      color: input.color,
      validFrom,
      validTo,
      // 「この日だけ休み」は毎週の設定を編集しても残す
      skipDates: existing?.skipDates ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
  };
}

export const actions = {
  /** テスト用：保存先を差し替える */
  _setRepository(repo: Repository | null) {
    repository = repo;
    state = null;
  },

  dismissWarning() {
    const s = ensureLoaded();
    state = { ...s, warning: null };
    emit();
  },

  /** 未配置のタスクとして追加する */
  addTask(input: { title: string; durationMin: number; color: string }): ActionResult {
    const title = input.title.trim();
    if (!title) return { ok: false, message: "タスク名を入力してください" };
    if (!validDuration(input.durationMin)) return { ok: false, message: "所要時間は1〜1440分で入力してください" };
    const d = data();
    const now = nowIso();
    const task: Task = {
      id: newId(),
      title,
      durationMin: input.durationMin,
      color: input.color,
      done: false,
      date: null,
      startMin: null,
      createdAt: now,
      updatedAt: now,
    };
    commit({ ...d, tasks: [...d.tasks, task] });
    return { ok: true };
  },

  /** タスクを date の startMin から durationMin 分で配置（移動・伸縮も同じ） */
  placeTask(id: string, date: DateKey, startMin: number, durationMin: number): ActionResult {
    const d = data();
    if (!d.tasks.some((t) => t.id === id)) return { ok: false, message: "タスクが見つかりません" };
    const check = checkPlacement(d.tasks, d.fixedEvents, date, id, startMin, startMin + durationMin);
    if (!check.ok) return { ok: false, message: check.message };
    updateTask(id, { date, startMin, durationMin });
    return { ok: true };
  },

  /** 名前・色・所要時間などの編集（配置は placeTask / unplaceTask で） */
  editTask(id: string, patch: { title?: string; color?: string; durationMin?: number }): ActionResult {
    const d = data();
    const task = d.tasks.find((t) => t.id === id);
    if (!task) return { ok: false, message: "タスクが見つかりません" };
    const title = patch.title?.trim();
    if (patch.title !== undefined && !title) return { ok: false, message: "タスク名を入力してください" };
    if (patch.durationMin !== undefined && !validDuration(patch.durationMin)) {
      return { ok: false, message: "所要時間は1〜1440分で入力してください" };
    }
    if (patch.durationMin !== undefined && task.date !== null && task.startMin !== null) {
      const check = checkPlacement(d.tasks, d.fixedEvents, task.date, id, task.startMin, task.startMin + patch.durationMin);
      if (!check.ok) return { ok: false, message: check.message };
    }
    updateTask(id, { ...patch, ...(title !== undefined ? { title } : {}) });
    return { ok: true };
  },

  unplaceTask(id: string) {
    updateTask(id, { date: null, startMin: null });
  },

  toggleDone(id: string) {
    const task = data().tasks.find((t) => t.id === id);
    if (task) updateTask(id, { done: !task.done });
  },

  deleteTask(id: string) {
    const d = data();
    commit({ ...d, tasks: d.tasks.filter((t) => t.id !== id) });
  },

  saveFixedEvent(input: FixedEventInput): ActionResult {
    const d = data();
    const existing = input.id ? d.fixedEvents.find((e) => e.id === input.id) : undefined;
    const built = buildFixedEvent(input, existing);
    if (!built.ok) return built;
    const fixedEvents = existing
      ? d.fixedEvents.map((e) => (e.id === built.event.id ? built.event : e))
      : [...d.fixedEvents, built.event];
    commit({ ...d, fixedEvents });
    return { ok: true };
  },

  /**
   * 通常のタスクを毎週の固定予定に変える。
   * 固定予定（曜日の規則）を 1 件作り、元のタスクは同じ保存処理の中で削除するので、二重に残らない。
   * 日付ごとの複製は作らない。重なる既存タスクがあっても削除・移動はしない（画面側で警告する）。
   */
  convertTaskToWeekly(taskId: string, input: Omit<FixedEventInput, "id">): ActionResult & { eventId?: string; task?: Task } {
    const d = data();
    const task = d.tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, message: "タスクが見つかりません" };
    if (!input.validFrom) return { ok: false, message: "繰り返し開始日を入力してください" };
    const built = buildFixedEvent(input, undefined);
    if (!built.ok) return built;
    commit({ ...d, tasks: d.tasks.filter((t) => t.id !== taskId), fixedEvents: [...d.fixedEvents, built.event] });
    return { ok: true, eventId: built.event.id, task };
  },

  /** convertTaskToWeekly の取り消し（固定予定を消し、元のタスクを戻す） */
  undoConvertTask(eventId: string, task: Task) {
    const d = data();
    commit({
      ...d,
      fixedEvents: d.fixedEvents.filter((e) => e.id !== eventId),
      tasks: d.tasks.some((t) => t.id === task.id) ? d.tasks : [...d.tasks, task],
    });
  },

  /**
   * 毎週の繰り返しを lastDate（この日を含む）までで終了する。
   * 過去の表示は残り、予定データは削除しない。
   */
  endFixedEventRepeat(id: string, lastDate: DateKey): ActionResult & { previousValidTo?: DateKey | null } {
    const d = data();
    const e = d.fixedEvents.find((x) => x.id === id);
    if (!e) return { ok: false, message: "固定予定が見つかりません" };
    if (e.validFrom && lastDate < e.validFrom) {
      return { ok: false, message: "繰り返し開始日より前には終了できません。不要なら設定画面で削除してください" };
    }
    commit({
      ...d,
      fixedEvents: d.fixedEvents.map((x) => (x.id === id ? { ...x, validTo: lastDate, updatedAt: nowIso() } : x)),
    });
    return { ok: true, previousValidTo: e.validTo };
  },

  /** 適用終了日を戻す（繰り返し終了の取り消し用） */
  setFixedEventValidTo(id: string, validTo: DateKey | null) {
    const d = data();
    commit({
      ...d,
      fixedEvents: d.fixedEvents.map((x) => (x.id === id ? { ...x, validTo, updatedAt: nowIso() } : x)),
    });
  },

  /** この日だけ休みにする（繰り返し設定そのものは変えない） */
  skipFixedEventOn(id: string, date: DateKey) {
    const d = data();
    commit({
      ...d,
      fixedEvents: d.fixedEvents.map((e) =>
        e.id === id && !e.skipDates.includes(date)
          ? { ...e, skipDates: [...e.skipDates, date].sort(), updatedAt: nowIso() }
          : e,
      ),
    });
  },

  /** 「この日だけ休み」を取り消す */
  unskipFixedEventOn(id: string, date: DateKey) {
    const d = data();
    commit({
      ...d,
      fixedEvents: d.fixedEvents.map((e) =>
        e.id === id ? { ...e, skipDates: e.skipDates.filter((x) => x !== date), updatedAt: nowIso() } : e,
      ),
    });
  },

  deleteFixedEvent(id: string) {
    const d = data();
    commit({ ...d, fixedEvents: d.fixedEvents.filter((e) => e.id !== id) });
  },

  updateSettings(patch: Partial<Settings>) {
    const d = data();
    commit({ ...d, settings: { ...d.settings, ...patch } });
  },
};

export { emptyData };
