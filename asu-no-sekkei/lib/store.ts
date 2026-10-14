"use client";

import { useSyncExternalStore } from "react";
import { saveSnapshot } from "./backup";
import { isDateKey, todayKey } from "./date";
import { wouldCreateCycle } from "./goals";
import { checkPlacement } from "./schedule";
import { DAY_MINUTES } from "./time";
import { emptyData, LocalStorageRepository, MAX_ESTIMATE_MINUTES, STORAGE_KEY, type Repository } from "./storage";
import type {
  AppData,
  DateKey,
  FixedEvent,
  Goal,
  GoalPriority,
  GoalStatus,
  GoalStep,
  Settings,
  StepStatus,
  Task,
  WorkLog,
} from "./types";

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

function updateGoal(id: string, patch: Partial<Goal>) {
  const d = data();
  commit({ ...d, goals: d.goals.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: nowIso() } : g)) });
}

function validEstimate(min: number): boolean {
  return Number.isInteger(min) && min >= 1 && min <= MAX_ESTIMATE_MINUTES;
}

export interface GoalInput {
  title: string;
  description: string;
  successCriteria: string;
  deadline: DateKey | null;
  priority: GoalPriority;
  estimatedMinutes: number | null;
  category: string;
  status: GoalStatus;
}

export interface StepInput {
  title: string;
  note: string;
  estimatedMinutes: number | null;
  status: StepStatus;
  dependsOn: string[];
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

  /**
   * 完了状態を切り替える。目標に紐づくタスクを完了にしたときは作業時間の実績（WorkLog）を記録し、
   * 未完了に戻したときはそのタスクから記録した実績を取り消す。工程の状態は自動では変えない。
   */
  toggleDone(id: string): { done: boolean; step: GoalStep | null } {
    const d = data();
    const task = d.tasks.find((t) => t.id === id);
    if (!task) return { done: false, step: null };
    const done = !task.done;
    const now = nowIso();
    const tasks = d.tasks.map((t) => (t.id === id ? { ...t, done, updatedAt: now } : t));
    let workLogs = d.workLogs.filter((l) => l.taskId !== id);
    const goal = task.goalId ? d.goals.find((g) => g.id === task.goalId) : undefined;
    if (done && goal) {
      workLogs = [
        ...workLogs,
        {
          id: newId(),
          goalId: goal.id,
          stepId: task.stepId ?? null,
          taskId: task.id,
          date: task.date ?? todayKey(),
          minutes: task.durationMin,
          note: "",
          createdAt: now,
        },
      ];
    }
    commit({ ...d, tasks, workLogs });
    const step = task.stepId ? (d.goalSteps.find((s) => s.id === task.stepId) ?? null) : null;
    return { done, step };
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

  /* ---------- 目標 ---------- */

  saveGoal(input: GoalInput & { id?: string }): ActionResult & { id?: string } {
    const title = input.title.trim();
    if (!title) return { ok: false, message: "目標名を入力してください" };
    if (input.deadline !== null && !isDateKey(input.deadline)) return { ok: false, message: "達成期限の日付が正しくありません" };
    if (input.estimatedMinutes !== null && !validEstimate(input.estimatedMinutes)) {
      return { ok: false, message: "想定必要時間は1分〜1万時間の範囲で入力してください" };
    }
    const d = data();
    const now = nowIso();
    const existing = input.id ? d.goals.find((g) => g.id === input.id) : undefined;
    const goal: Goal = {
      id: existing?.id ?? newId(),
      title,
      description: input.description.trim(),
      successCriteria: input.successCriteria.trim(),
      deadline: input.deadline,
      priority: input.priority,
      estimatedMinutes: input.estimatedMinutes,
      category: input.category.trim(),
      status: input.status,
      achievedAt: existing?.achievedAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    commit({ ...d, goals: existing ? d.goals.map((g) => (g.id === goal.id ? goal : g)) : [...d.goals, goal] });
    return { ok: true, id: goal.id };
  },

  setGoalStatus(id: string, status: GoalStatus) {
    updateGoal(id, { status });
  },

  /** 達成の記録（作業時間の実績や工程の状態とは独立） */
  setGoalAchieved(id: string, achieved: boolean) {
    updateGoal(id, { achievedAt: achieved ? nowIso() : null });
  },

  /**
   * 目標を削除する。工程と実績は一緒に削除し、作ったタスクは残して紐づけだけ外す。
   * 戻り値は「元に戻す」用の削除前のデータ。
   */
  deleteGoal(id: string): AppData {
    const d = data();
    commit({
      ...d,
      goals: d.goals.filter((g) => g.id !== id),
      goalSteps: d.goalSteps.filter((s) => s.goalId !== id),
      workLogs: d.workLogs.filter((l) => l.goalId !== id),
      tasks: d.tasks.map((t) => (t.goalId === id ? { ...t, goalId: null, stepId: null, updatedAt: nowIso() } : t)),
    });
    return d;
  },

  /* ---------- 工程 ---------- */

  saveStep(input: StepInput & { id?: string; goalId: string }): ActionResult & { id?: string } {
    const d = data();
    if (!d.goals.some((g) => g.id === input.goalId)) return { ok: false, message: "目標が見つかりません" };
    const title = input.title.trim();
    if (!title) return { ok: false, message: "工程名を入力してください" };
    if (input.estimatedMinutes !== null && !validEstimate(input.estimatedMinutes)) {
      return { ok: false, message: "必要時間は1分〜1万時間の範囲で入力してください" };
    }
    const existing = input.id ? d.goalSteps.find((s) => s.id === input.id) : undefined;
    const id = existing?.id ?? newId();
    const siblings = d.goalSteps.filter((s) => s.goalId === input.goalId);
    const deps = [...new Set(input.dependsOn)].filter((dep) => dep !== id);
    if (deps.some((dep) => !siblings.some((s) => s.id === dep))) return { ok: false, message: "前提の工程は同じ目標の工程から選んでください" };
    if (wouldCreateCycle(siblings, id, deps)) return { ok: false, message: "前提の関係が循環するため保存できません" };
    const now = nowIso();
    const step: GoalStep = {
      id,
      goalId: input.goalId,
      title,
      note: input.note.trim(),
      estimatedMinutes: input.estimatedMinutes,
      status: input.status,
      order: existing?.order ?? Math.max(0, ...siblings.map((s) => s.order + 1)),
      dependsOn: deps,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    commit({
      ...d,
      goalSteps: existing ? d.goalSteps.map((s) => (s.id === id ? step : s)) : [...d.goalSteps, step],
    });
    return { ok: true, id };
  },

  setStepStatus(id: string, status: StepStatus) {
    const d = data();
    commit({ ...d, goalSteps: d.goalSteps.map((s) => (s.id === id ? { ...s, status, updatedAt: nowIso() } : s)) });
  },

  /** 作業順序を 1 つ前／後ろへ */
  moveStep(id: string, dir: -1 | 1) {
    const d = data();
    const step = d.goalSteps.find((s) => s.id === id);
    if (!step) return;
    const ordered = d.goalSteps
      .filter((s) => s.goalId === step.goalId)
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    const i = ordered.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    const orderOf = new Map(ordered.map((s, k) => [s.id, k]));
    commit({
      ...d,
      goalSteps: d.goalSteps.map((s) => (orderOf.has(s.id) ? { ...s, order: orderOf.get(s.id)! } : s)),
    });
  },

  /** 工程を削除する。他の工程の前提からも外し、タスクは残して工程との紐づけだけ外す */
  deleteStep(id: string) {
    const d = data();
    commit({
      ...d,
      goalSteps: d.goalSteps
        .filter((s) => s.id !== id)
        .map((s) => (s.dependsOn.includes(id) ? { ...s, dependsOn: s.dependsOn.filter((x) => x !== id) } : s)),
      tasks: d.tasks.map((t) => (t.stepId === id ? { ...t, stepId: null, updatedAt: nowIso() } : t)),
      workLogs: d.workLogs.map((l) => (l.stepId === id ? { ...l, stepId: null } : l)),
    });
  },

  /** 工程から通常のタスク（未配置）を作る。目標・工程との対応を保持する */
  createTaskFromStep(stepId: string, opts: { durationMin?: number; color?: string } = {}): ActionResult & { taskId?: string } {
    const d = data();
    const step = d.goalSteps.find((s) => s.id === stepId);
    if (!step) return { ok: false, message: "工程が見つかりません" };
    const durationMin = opts.durationMin ?? Math.min(step.estimatedMinutes ?? 30, 240);
    if (!validDuration(durationMin)) return { ok: false, message: "所要時間は1〜1440分で入力してください" };
    const now = nowIso();
    const task: Task = {
      id: newId(),
      title: step.title,
      durationMin,
      color: opts.color ?? "violet",
      done: false,
      date: null,
      startMin: null,
      goalId: step.goalId,
      stepId: step.id,
      createdAt: now,
      updatedAt: now,
    };
    commit({
      ...d,
      tasks: [...d.tasks, task],
      // 未着手の工程からタスクを作ったら「進行中」にする
      goalSteps: d.goalSteps.map((s) => (s.id === stepId && s.status === "todo" ? { ...s, status: "doing", updatedAt: now } : s)),
    });
    return { ok: true, taskId: task.id };
  },

  /* ---------- 実績 ---------- */

  addWorkLog(input: { goalId: string; stepId: string | null; date: DateKey; minutes: number; note: string }): ActionResult {
    const d = data();
    if (!d.goals.some((g) => g.id === input.goalId)) return { ok: false, message: "目標が見つかりません" };
    if (!isDateKey(input.date)) return { ok: false, message: "日付が正しくありません" };
    if (!validDuration(input.minutes)) return { ok: false, message: "作業時間は1〜1440分で入力してください" };
    const log: WorkLog = {
      id: newId(),
      goalId: input.goalId,
      stepId: input.stepId,
      taskId: null,
      date: input.date,
      minutes: input.minutes,
      note: input.note.trim(),
      createdAt: nowIso(),
    };
    commit({ ...d, workLogs: [...d.workLogs, log] });
    return { ok: true };
  },

  deleteWorkLog(id: string) {
    const d = data();
    commit({ ...d, workLogs: d.workLogs.filter((l) => l.id !== id) });
  },

  /* ---------- バックアップ ---------- */

  /**
   * 保存データ全体を置き換える（バックアップからの復元・元に戻す専用）。
   * 置き換える前の状態は必ずスナップショットとして残す。
   */
  replaceAll(next: AppData, reason: string): ActionResult {
    const current = data();
    const snap = saveSnapshot(current, reason);
    if (!snap.ok) return snap;
    commit(next);
    return { ok: true };
  },

  updateSettings(patch: Partial<Settings>) {
    const d = data();
    commit({ ...d, settings: { ...d.settings, ...patch } });
  },
};

export { emptyData };
