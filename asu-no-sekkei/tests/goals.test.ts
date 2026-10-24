import { beforeEach, describe, expect, it } from "vitest";
import { buildBackupFile, parseBackupFile } from "@/lib/backup";
import { goalStats, goalTab, unfinishedDependencies, wouldCreateCycle } from "@/lib/goals";
import { parseAppData, type Repository } from "@/lib/storage";
import { actions } from "@/lib/store";
import type { AppData } from "@/lib/types";

class MemoryRepository implements Repository {
  saved: AppData | null = null;
  constructor(initial?: unknown) {
    if (initial) this.saved = JSON.parse(JSON.stringify(initial));
  }
  load() {
    return parseAppData(this.saved ? JSON.stringify(this.saved) : null);
  }
  save(data: AppData) {
    this.saved = JSON.parse(JSON.stringify(data));
  }
}

const now = "2026-10-14T00:00:00.000Z";

/** 現在公開中の v2 の保存データ（目標なし） */
const V2 = {
  schemaVersion: 2,
  settings: { snapMinutes: 1, pxPerMinute: 2 },
  fixedEvents: [
    { id: "f1", title: "大学", weekdays: [1, 3], startMin: 540, endMin: 720, color: "slate", validFrom: null, validTo: null, skipDates: ["2026-10-21"], createdAt: now, updatedAt: now },
  ],
  tasks: [
    { id: "t1", title: "レポート", durationMin: 60, color: "blue", done: false, date: "2026-10-15", startMin: 780, createdAt: now, updatedAt: now },
    { id: "t2", title: "英単語", durationMin: 30, color: "violet", done: true, date: null, startMin: null, createdAt: now, updatedAt: now },
  ],
};

describe("v2 → v3 の読み込み（既存データの保護）", () => {
  it("既存のタスク・固定予定・設定はそのまま、目標・工程・実績は空で追加される", () => {
    const r = parseAppData(JSON.stringify(V2));
    expect(r.warning).toBeNull();
    expect(r.data.schemaVersion).toBe(3);
    expect(r.data.tasks.map((t) => ({ id: t.id, title: t.title, date: t.date, startMin: t.startMin, done: t.done }))).toEqual([
      { id: "t1", title: "レポート", date: "2026-10-15", startMin: 780, done: false },
      { id: "t2", title: "英単語", date: null, startMin: null, done: true },
    ]);
    expect(r.data.tasks[0].goalId).toBeNull();
    expect(r.data.fixedEvents[0]).toMatchObject({ id: "f1", skipDates: ["2026-10-21"] });
    expect(r.data.settings).toEqual({ snapMinutes: 1, pxPerMinute: 2 });
    expect(r.data).toMatchObject({ goals: [], goalSteps: [], workLogs: [] });
  });

  it("壊れた参照は除外・解除し、タスク自体は残す", () => {
    const r = parseAppData(
      JSON.stringify({
        ...V2,
        schemaVersion: 3,
        goals: [{ id: "g1", title: "TOEIC", status: "active", priority: "high" }],
        goalSteps: [
          { id: "s1", goalId: "g1", title: "単語", order: 0, dependsOn: ["s1", "s2", "x"] },
          { id: "s2", goalId: "g1", title: "文法", order: 1, dependsOn: [] },
          { id: "orphan", goalId: "nope", title: "迷子", order: 0 },
        ],
        workLogs: [
          { id: "l1", goalId: "g1", stepId: "gone", taskId: null, date: "2026-10-14", minutes: 30 },
          { id: "l2", goalId: "nope", date: "2026-10-14", minutes: 30 },
          { id: "l3", goalId: "g1", date: "2026-10-14", minutes: 0 },
        ],
        tasks: [{ ...V2.tasks[0], goalId: "missing", stepId: "s1" }],
      }),
    );
    expect(r.data.goalSteps.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(r.data.goalSteps[0].dependsOn).toEqual(["s2"]);
    expect(r.data.workLogs.map((l) => [l.id, l.stepId])).toEqual([["l1", null]]);
    expect(r.data.tasks[0]).toMatchObject({ id: "t1", goalId: null, stepId: null });
    expect(r.warning).toContain("3件");
  });
});

describe("目標・工程・タスク・実績", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository(V2);
    actions._setRepository(repo);
  });

  const addGoal = (o: Record<string, unknown> = {}) =>
    actions.saveGoal({
      title: "TOEIC 800点",
      description: "",
      successCriteria: "公式テストで800点以上",
      deadline: "2026-12-20",
      priority: "high",
      estimatedMinutes: 6000,
      category: "資格",
      status: "active",
      ...o,
    }).id!;
  const addStep = (goalId: string, title: string, min: number | null, deps: string[] = []) =>
    actions.saveStep({ goalId, title, note: "", estimatedMinutes: min, status: "todo", dependsOn: deps }).id!;

  it("目標を追加しても既存のタスク・固定予定は変わらない", () => {
    addGoal();
    expect(repo.saved!.schemaVersion).toBe(3);
    expect(repo.saved!.goals).toHaveLength(1);
    expect(repo.saved!.tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(repo.saved!.fixedEvents).toHaveLength(1);
  });

  it("やりたいことと取り組み中を区別する", () => {
    const a = addGoal({ status: "wish", title: "海外旅行" });
    const b = addGoal({ status: "active" });
    const goals = repo.saved!.goals;
    expect(goalTab(goals.find((g) => g.id === a)!)).toBe("wish");
    expect(goalTab(goals.find((g) => g.id === b)!)).toBe("active");
    actions.setGoalStatus(a, "active");
    expect(goalTab(repo.saved!.goals.find((g) => g.id === a)!)).toBe("active");
  });

  it("入力の検証", () => {
    expect(actions.saveGoal({ title: " ", description: "", successCriteria: "", deadline: null, priority: "low", estimatedMinutes: null, category: "", status: "wish" }).ok).toBe(false);
    const g = addGoal();
    expect(actions.saveStep({ goalId: g, title: "", note: "", estimatedMinutes: null, status: "todo", dependsOn: [] }).ok).toBe(false);
    expect(actions.saveStep({ goalId: g, title: "x", note: "", estimatedMinutes: 0, status: "todo", dependsOn: [] }).ok).toBe(false);
    expect(actions.saveStep({ goalId: "nope", title: "x", note: "", estimatedMinutes: null, status: "todo", dependsOn: [] }).ok).toBe(false);
  });

  it("工程の作業順序・依存関係（循環は拒否）", () => {
    const g = addGoal();
    const s1 = addStep(g, "単語帳", 1200);
    const s2 = addStep(g, "文法", 600, [s1]);
    const s3 = addStep(g, "模試", 240, [s2]);
    expect(repo.saved!.goalSteps.map((s) => s.order)).toEqual([0, 1, 2]);
    // s1 の前提に s3 を入れると s1→s3→s2→s1 で循環
    const r = actions.saveStep({ id: s1, goalId: g, title: "単語帳", note: "", estimatedMinutes: 1200, status: "todo", dependsOn: [s3] });
    expect(r.ok).toBe(false);
    expect(wouldCreateCycle(repo.saved!.goalSteps, s1, [s3])).toBe(true);
    // 前提が未完了なら次の工程にならない
    let st = goalStats(repo.saved!.goals[0], repo.saved!.goalSteps, repo.saved!.workLogs, "2026-10-14");
    expect(st.nextStep?.id).toBe(s1);
    expect(unfinishedDependencies(repo.saved!.goalSteps, repo.saved!.goalSteps.find((s) => s.id === s2)!).map((s) => s.id)).toEqual([s1]);
    actions.setStepStatus(s1, "done");
    st = goalStats(repo.saved!.goals[0], repo.saved!.goalSteps, repo.saved!.workLogs, "2026-10-14");
    expect(st.nextStep?.id).toBe(s2);
    expect(st).toMatchObject({ stepsTotal: 3, stepsDone: 1, estimatedMinutes: 6000, remainingStepMinutes: 840, daysLeft: 67 });
    // 並べ替え
    actions.moveStep(s3, -1);
    const order = [...repo.saved!.goalSteps].sort((a, b) => a.order - b.order).map((s) => s.id);
    expect(order).toEqual([s1, s3, s2]);
    // 削除すると他の工程の前提からも外れる
    actions.deleteStep(s2);
    expect(repo.saved!.goalSteps.find((s) => s.id === s3)!.dependsOn).toEqual([]);
  });

  it("工程からタスクを作り、対応関係を保持する。完了で実績を記録、未完了に戻すと取り消し", () => {
    const g = addGoal();
    const s1 = addStep(g, "単語帳 Unit1", 45);
    const r = actions.createTaskFromStep(s1);
    expect(r.ok).toBe(true);
    const task = repo.saved!.tasks.find((t) => t.id === r.taskId)!;
    expect(task).toMatchObject({ title: "単語帳 Unit1", durationMin: 45, goalId: g, stepId: s1, date: null, startMin: null });
    expect(repo.saved!.goalSteps[0].status).toBe("doing");
    // 配置して完了
    expect(actions.placeTask(task.id, "2026-10-15", 600, 45).ok).toBe(true);
    const done = actions.toggleDone(task.id);
    expect(done).toMatchObject({ done: true, step: { id: s1 } });
    expect(repo.saved!.workLogs).toEqual([expect.objectContaining({ goalId: g, stepId: s1, taskId: task.id, date: "2026-10-15", minutes: 45 })]);
    // 達成とは別：実績があっても未達成のまま、工程も自動では完了にならない
    expect(repo.saved!.goals[0].achievedAt).toBeNull();
    expect(repo.saved!.goalSteps[0].status).toBe("doing");
    actions.toggleDone(task.id);
    expect(repo.saved!.workLogs).toEqual([]);
    // 目標と関係ないタスクの完了は実績にならない
    actions.toggleDone("t1");
    expect(repo.saved!.workLogs).toEqual([]);
  });

  it("達成は作業時間と独立して記録・取り消しできる", () => {
    const g = addGoal();
    actions.setGoalAchieved(g, true);
    expect(repo.saved!.goals[0].achievedAt).not.toBeNull();
    expect(goalTab(repo.saved!.goals[0])).toBe("done");
    expect(repo.saved!.workLogs).toEqual([]);
    actions.setGoalAchieved(g, false);
    expect(repo.saved!.goals[0].achievedAt).toBeNull();
  });

  it("手入力の実績と、目標の削除（タスクは残して紐づけを外す）", () => {
    const g = addGoal();
    const s1 = addStep(g, "単語", 60);
    expect(actions.addWorkLog({ goalId: g, stepId: s1, date: "2026-10-14", minutes: 25, note: "通学中" }).ok).toBe(true);
    expect(actions.addWorkLog({ goalId: g, stepId: null, date: "2026-10-14", minutes: 0, note: "" }).ok).toBe(false);
    const taskId = actions.createTaskFromStep(s1).taskId!;
    const before = actions.deleteGoal(g);
    expect(repo.saved!.goals).toEqual([]);
    expect(repo.saved!.goalSteps).toEqual([]);
    expect(repo.saved!.workLogs).toEqual([]);
    expect(repo.saved!.tasks.find((t) => t.id === taskId)).toMatchObject({ goalId: null, stepId: null });
    // 元に戻す
    expect(actions.replaceAll(before, "test").ok).toBe(true);
    expect(repo.saved!.goals).toHaveLength(1);
    expect(repo.saved!.tasks.find((t) => t.id === taskId)).toMatchObject({ goalId: g, stepId: s1 });
  });
});

describe("バックアップ", () => {
  it("書き出したファイルを読み戻すと同じ内容になる", () => {
    const data = parseAppData(JSON.stringify(V2)).data;
    const file = JSON.stringify(buildBackupFile(data, new Date("2026-10-14T03:00:00Z")));
    const parsed = parseBackupFile(file);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.exportedAt).toBe("2026-10-14T03:00:00.000Z");
      expect(parsed.result.data).toEqual(data);
    }
  });
  it("保存データそのもの（v2 の JSON）も読み込める", () => {
    const parsed = parseBackupFile(JSON.stringify(V2));
    expect(parsed.ok && parsed.result.data.tasks.length).toBe(2);
  });
  it("関係ないファイルは拒否する", () => {
    expect(parseBackupFile("not json").ok).toBe(false);
    expect(parseBackupFile(JSON.stringify({ hello: 1 })).ok).toBe(false);
    expect(parseBackupFile(JSON.stringify([1, 2])).ok).toBe(false);
  });
});

describe("AI の提案の保存・明日の時間割への追加", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository(V2);
    actions._setRepository(repo);
  });

  const goalInput = {
    title: "TOEIC 800点",
    description: "",
    successCriteria: "公式テストで800点",
    deadline: "2026-12-20",
    priority: "high" as const,
    estimatedMinutes: null,
    category: "資格",
    status: "active" as const,
  };
  const approved = (key: string, title: string, minutes: number, dependsOn: string[] = [], aiEstimated = true) => ({
    key,
    title,
    detail: `${title}の詳細`,
    estimatedMinutes: minutes,
    priority: "high" as const,
    dependsOn,
    aiEstimated,
  });

  it("承認した工程だけを新しい目標として保存し、既存のタスク・固定予定は変えない", () => {
    const before = JSON.parse(JSON.stringify(repo.saved));
    const r = actions.applyAiPlan({
      goalId: null,
      goal: goalInput,
      steps: [approved("a", "単語帳", 300), approved("b", "文法", 600, ["a"], false)],
    });
    expect(r.ok).toBe(true);
    const saved = repo.saved!;
    expect(saved.goals).toHaveLength(1);
    expect(saved.goals[0]).toMatchObject({ id: r.goalId, title: "TOEIC 800点", deadline: "2026-12-20" });
    const steps = saved.goalSteps;
    expect(steps.map((s) => ({ t: s.title, n: s.note, m: s.estimatedMinutes, p: s.priority, ai: s.aiEstimated, st: s.status }))).toEqual([
      { t: "単語帳", n: "単語帳の詳細", m: 300, p: "high", ai: true, st: "todo" },
      { t: "文法", n: "文法の詳細", m: 600, p: "high", ai: false, st: "todo" },
    ]);
    expect(steps[1].dependsOn).toEqual([steps[0].id]);
    expect(saved.tasks.map((t) => ({ id: t.id, title: t.title, date: t.date, startMin: t.startMin, done: t.done }))).toEqual(
      before.tasks.map((t: Record<string, unknown>) => ({ id: t.id, title: t.title, date: t.date, startMin: t.startMin, done: t.done })),
    );
    expect(saved.fixedEvents.map((e) => e.id)).toEqual(["f1"]);
    expect(saved.fixedEvents[0].skipDates).toEqual(["2026-10-21"]);
  });

  it("既存の目標に追加すると、既存の工程の後ろに並ぶ", () => {
    const g = actions.applyAiPlan({ goalId: null, goal: goalInput, steps: [approved("a", "既存1", 30)] }).goalId!;
    actions.saveStep({ goalId: g, title: "手で追加", note: "", estimatedMinutes: 10, status: "done", dependsOn: [] });
    expect(actions.applyAiPlan({ goalId: g, goal: null, steps: [approved("x", "追加1", 60)] }).ok).toBe(true);
    const steps = repo.saved!.goalSteps.filter((s) => s.goalId === g).sort((a, b) => a.order - b.order);
    expect(steps.map((s) => s.title)).toEqual(["既存1", "手で追加", "追加1"]);
    expect(steps[1].status).toBe("done");
    expect(repo.saved!.goals).toHaveLength(1);
  });

  it("不正な提案は何も保存しない（循環・空の名前・存在しない目標）", () => {
    const before = JSON.stringify(repo.saved);
    expect(actions.applyAiPlan({ goalId: null, goal: goalInput, steps: [approved("a", "A", 30, ["b"]), approved("b", "B", 30, ["a"])] }).ok).toBe(false);
    expect(actions.applyAiPlan({ goalId: null, goal: goalInput, steps: [approved("a", " ", 30)] }).ok).toBe(false);
    expect(actions.applyAiPlan({ goalId: "nope", goal: null, steps: [approved("a", "A", 30)] }).ok).toBe(false);
    expect(actions.applyAiPlan({ goalId: null, goal: goalInput, steps: [] }).ok).toBe(false);
    expect(JSON.stringify(repo.saved)).toBe(before);
  });

  it("工程を明日の空き時間に追加する（固定予定・配置済みタスクを避け、空きがなければ未配置）", () => {
    // 10/15（木）は固定予定なし（大学は月・水）、配置済み：レポート 13:00-14:00
    const g = actions.applyAiPlan({ goalId: null, goal: goalInput, steps: [approved("a", "単語帳", 300), approved("b", "文法", 600)] }).goalId!;
    const [s1, s2] = repo.saved!.goalSteps.filter((s) => s.goalId === g);
    const r1 = actions.addStepToDay(s1.id, "2026-10-15", 60, { from: 720, to: 900, step: 5 });
    expect(r1).toMatchObject({ ok: true, startMin: 720 }); // 12:00-13:00
    const r2 = actions.addStepToDay(s2.id, "2026-10-15", 60, { from: 720, to: 900, step: 5 });
    expect(r2).toMatchObject({ ok: true, startMin: 840 }); // レポート（13:00-14:00）の後
    const r3 = actions.addStepToDay(s1.id, "2026-10-15", 60, { from: 720, to: 900, step: 5 });
    expect(r3).toMatchObject({ ok: true, startMin: null }); // 空きなし → 未配置
    const tasks = repo.saved!.tasks;
    expect(tasks.find((t) => t.id === r1.taskId)).toMatchObject({ date: "2026-10-15", startMin: 720, durationMin: 60, goalId: g, stepId: s1.id });
    expect(tasks.find((t) => t.id === r3.taskId)).toMatchObject({ date: null, startMin: null });
    expect(tasks.find((t) => t.id === "t1")).toMatchObject({ date: "2026-10-15", startMin: 780 });
  });

  it("固定予定の時間は避ける（水曜の大学 9:00-12:00）", () => {
    const g = actions.applyAiPlan({ goalId: null, goal: goalInput, steps: [approved("a", "単語帳", 300)] }).goalId!;
    const s = repo.saved!.goalSteps.find((x) => x.goalId === g)!;
    expect(actions.addStepToDay(s.id, "2026-10-14", 60, { from: 540, to: 900, step: 5 })).toMatchObject({ startMin: 720 });
  });
});
