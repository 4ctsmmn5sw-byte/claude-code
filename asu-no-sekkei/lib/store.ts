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

  saveFixedEvent(input: Omit<FixedEvent, "id" | "createdAt" | "updatedAt"> & { id?: string }): ActionResult {
    const title = input.title.trim();
    if (!title) return { ok: false, message: "予定名を入力してください" };
    if (input.weekdays.length === 0) return { ok: false, message: "曜日を1つ以上選んでください" };
    if (input.startMin < 0 || input.endMin > DAY_MINUTES || input.endMin <= input.startMin) {
      return { ok: false, message: "終了時刻は開始時刻より後にしてください（0:00〜24:00）" };
    }
    const d = data();
    const now = nowIso();
    const weekdays = [...new Set(input.weekdays)].sort();
    const existing = input.id ? d.fixedEvents.find((e) => e.id === input.id) : undefined;
    const event: FixedEvent = {
      id: existing?.id ?? newId(),
      title,
      weekdays,
      startMin: input.startMin,
      endMin: input.endMin,
      color: input.color,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const fixedEvents = existing
      ? d.fixedEvents.map((e) => (e.id === event.id ? event : e))
      : [...d.fixedEvents, event];
    commit({ ...d, fixedEvents });
    return { ok: true };
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
