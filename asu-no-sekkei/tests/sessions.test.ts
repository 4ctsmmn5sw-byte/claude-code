import { beforeEach, describe, expect, it } from "vitest";
import { latestPrerequisiteDate, proposeSessions, splitSessions, stepProgress } from "@/lib/sessions";
import { parseAppData, type Repository } from "@/lib/storage";
import { actions } from "@/lib/store";
import type { AppData, FixedEvent, Task } from "@/lib/types";

const now = "2026-10-14T00:00:00.000Z";
const task = (o: Partial<Task>): Task => ({
  id: "x", title: "x", durationMin: 60, color: "blue", done: false, date: null, startMin: null, createdAt: now, updatedAt: now, ...o,
});
const univ: FixedEvent = {
  id: "f1", title: "大学", weekdays: [1, 2, 3, 4, 5], startMin: 540, endMin: 1080, color: "slate",
  validFrom: null, validTo: null, skipDates: [], createdAt: now, updatedAt: now,
};

describe("1回の作業時間に分ける", () => {
  it("5時間を60分×5回", () => {
    expect(splitSessions(300, 60)).toEqual([60, 60, 60, 60, 60]);
  });
  it("端数：15分以上は最後の1回、15分未満は最後の回に足す", () => {
    expect(splitSessions(280, 60)).toEqual([60, 60, 60, 60, 40]);
    expect(splitSessions(310, 60)).toEqual([60, 60, 60, 60, 70]);
    expect(splitSessions(301, 60)).toEqual([60, 60, 60, 60, 65]); // 5分単位に切り上げ
    expect(splitSessions(20, 60)).toEqual([20]);
    expect(splitSessions(100, 45)).toEqual([45, 55]);
    expect(splitSessions(0, 60)).toEqual([]);
  });
});

describe("複数日への配置の候補（保存しない）", () => {
  it("1日1回ずつ、固定予定・既存のタスクを避けて最も早い空き時間に入れる", () => {
    // 10/15(木)〜：平日は大学 9:00-18:00。10/15 は 8:00-9:00 にタスクあり
    const existing = [task({ id: "t1", date: "2026-10-15", startMin: 480, durationMin: 60 })];
    const r = proposeSessions({ tasks: existing, events: [univ], startDate: "2026-10-15", sessions: splitSessions(300, 60) });
    expect(r.candidates).toEqual([
      { date: "2026-10-15", startMin: 1080, durationMin: 60 },
      { date: "2026-10-16", startMin: 480, durationMin: 60 },
      { date: "2026-10-17", startMin: 480, durationMin: 60 },
      { date: "2026-10-18", startMin: 480, durationMin: 60 },
      { date: "2026-10-19", startMin: 480, durationMin: 60 },
    ]);
    expect(r.unplacedMinutes).toBe(0);
    expect(existing).toHaveLength(1); // 元の配列は変えない
  });

  it("空きがない日は飛ばす。短くする設定なら空きに合わせて45分・30分にし、足りない分は後ろへ回す", () => {
    // 毎日 8:00-21:15 が埋まっていて、空きは 21:15-22:00（45分）だけ
    const allDay: FixedEvent = { ...univ, weekdays: [0, 1, 2, 3, 4, 5, 6], startMin: 480, endMin: 1275 };
    const strict = proposeSessions({ tasks: [], events: [allDay], startDate: "2026-10-15", sessions: [60, 60], maxDays: 5 });
    expect(strict.candidates).toEqual([]);
    expect(strict.unplacedMinutes).toBe(120);
    const adapt = proposeSessions({ tasks: [], events: [allDay], startDate: "2026-10-15", sessions: [60, 60], adapt: true, maxDays: 5 });
    expect(adapt.candidates.map((c) => c.durationMin)).toEqual([45, 45, 30]);
    expect(adapt.candidates.reduce((s, c) => s + c.durationMin, 0)).toBe(120);
  });

  it("前提の工程の未完了タスクのうち最も遅い日", () => {
    const step = { id: "s2", dependsOn: ["s1"] } as never;
    const tasks = [
      task({ id: "a", stepId: "s1", date: "2026-10-16", startMin: 600 }),
      task({ id: "b", stepId: "s1", date: "2026-10-20", startMin: 600 }),
      task({ id: "c", stepId: "s1", date: "2026-10-25", startMin: 600, done: true }),
    ];
    expect(latestPrerequisiteDate(step, tasks)).toBe("2026-10-20");
  });
});

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

describe("工程の進捗（予定と実績を分ける）", () => {
  let repo: MemoryRepository;
  let goalId: string;
  let stepId: string;
  const LONG = { id: "old", title: "前に作った長いタスク", durationMin: 240, color: "violet", done: false, date: null, startMin: null, createdAt: now, updatedAt: now };
  beforeEach(() => {
    repo = new MemoryRepository({ schemaVersion: 3, settings: { snapMinutes: 5, pxPerMinute: 1.5 }, fixedEvents: [univ], tasks: [], goals: [], goalSteps: [], workLogs: [] });
    actions._setRepository(repo);
    goalId = actions.saveGoal({ title: "TOEIC", description: "", successCriteria: "", deadline: null, priority: "high", estimatedMinutes: null, category: "", status: "active" }).id!;
    stepId = actions.saveStep({ goalId, title: "文法問題集", note: "", estimatedMinutes: 300, status: "todo", dependsOn: [] }).id!;
  });
  const step = () => repo.saved!.goalSteps.find((s) => s.id === stepId)!;
  const prog = () => stepProgress(step(), repo.saved!.tasks, repo.saved!.workLogs);

  it("タスクにすると1回分（初期値60分）だけ。工程の総必要時間は変えない", () => {
    const r = actions.createTaskFromStep(stepId);
    expect(repo.saved!.tasks.find((t) => t.id === r.taskId)).toMatchObject({ durationMin: 60, goalId, stepId });
    expect(step().estimatedMinutes).toBe(300);
  });

  it("5時間を60分×5回に分けて複数日に配置し、まとめて保存。総必要時間は変えず、1回の時間を覚える", () => {
    const { candidates } = proposeSessions({ tasks: repo.saved!.tasks, events: repo.saved!.fixedEvents, startDate: "2026-10-15", sessions: splitSessions(300, 60) });
    const r = actions.createStepTasks(stepId, candidates, { sessionMinutes: 60 });
    expect(r.ok).toBe(true);
    const tasks = repo.saved!.tasks;
    expect(tasks).toHaveLength(5);
    expect(new Set(tasks.map((t) => t.date)).size).toBe(5);
    expect(tasks.every((t) => t.durationMin === 60 && t.goalId === goalId && t.stepId === stepId)).toBe(true);
    expect(step()).toMatchObject({ estimatedMinutes: 300, sessionMinutes: 60, status: "doing" });
    expect(prog()).toMatchObject({ actualMinutes: 0, remainingMinutes: 300, plannedMinutes: 300, placedMinutes: 300, unplannedMinutes: 0, overPlannedMinutes: 0 });
  });

  it("重なる候補が1つでもあれば何も保存しない", () => {
    const before = JSON.stringify(repo.saved);
    const r = actions.createStepTasks(stepId, [
      { durationMin: 60, date: "2026-10-15", startMin: 1080 },
      { durationMin: 60, date: "2026-10-15", startMin: 600 }, // 大学と重なる
    ]);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(repo.saved)).toBe(before);
  });

  it("完了で実績に反映（予定からは外れる）。完了を繰り返しても二重計上しない。工程は完了にしない", () => {
    const ids = actions.createStepTasks(stepId, [
      { durationMin: 60, date: null, startMin: null },
      { durationMin: 60, date: null, startMin: null },
    ]).taskIds!;
    const r = actions.toggleDone(ids[0]);
    expect(r.progress).toMatchObject({ actualMinutes: 60, remainingMinutes: 240, plannedMinutes: 60, unplannedMinutes: 180 });
    expect(step().status).toBe("doing");
    actions.toggleDone(ids[0]); // 取り消し
    actions.toggleDone(ids[0]); // もう一度完了
    expect(repo.saved!.workLogs.filter((l) => l.taskId === ids[0])).toHaveLength(1);
    expect(prog().actualMinutes).toBe(60);
  });

  it("実際の時間に修正すると、残り必要時間に反映（記録は1件のまま）", () => {
    const [id] = actions.createStepTasks(stepId, [{ durationMin: 60, date: null, startMin: null }]).taskIds!;
    actions.toggleDone(id);
    const log = repo.saved!.workLogs.find((l) => l.taskId === id)!;
    expect(actions.updateWorkLog(log.id, { minutes: 90, date: log.date, note: "" }).ok).toBe(true);
    expect(repo.saved!.workLogs).toHaveLength(1);
    expect(prog()).toMatchObject({ actualMinutes: 90, remainingMinutes: 210 });
  });

  it("予定が残り必要時間を超えた分を出す（追加練習として作ることはできる）", () => {
    actions.createStepTasks(stepId, Array.from({ length: 6 }, () => ({ durationMin: 60, date: null, startMin: null })));
    expect(prog()).toMatchObject({ plannedMinutes: 360, unplannedMinutes: 0, overPlannedMinutes: 60 });
  });

  it("残りが短ければ、タスクの初期値は残りの時間まで", () => {
    actions.createStepTasks(stepId, Array.from({ length: 4 }, () => ({ durationMin: 60, date: null, startMin: null })));
    actions.createStepTasks(stepId, [{ durationMin: 15, date: null, startMin: null }]);
    const r = actions.createTaskFromStep(stepId);
    expect(repo.saved!.tasks.find((t) => t.id === r.taskId)!.durationMin).toBe(45);
  });

  it("前に作った長いタスクはそのまま（変更・削除しない）", () => {
    repo.saved!.tasks.push({ ...LONG, goalId, stepId });
    actions._setRepository(repo);
    actions.createStepTasks(stepId, [{ durationMin: 60, date: null, startMin: null }]);
    expect(repo.saved!.tasks.find((t) => t.id === "old")).toMatchObject({ durationMin: 240, title: "前に作った長いタスク" });
    expect(prog().plannedMinutes).toBe(300);
  });

  it("再読み込み後も1回の作業時間・タスク・実績を保持する", () => {
    const [id] = actions.createStepTasks(stepId, [{ durationMin: 45, date: "2026-10-17", startMin: 600 }], { sessionMinutes: 45 }).taskIds!;
    actions.toggleDone(id);
    const reloaded = parseAppData(JSON.stringify(repo.saved)).data;
    expect(reloaded.goalSteps.find((s) => s.id === stepId)).toMatchObject({ sessionMinutes: 45, estimatedMinutes: 300 });
    expect(reloaded.tasks.find((t) => t.id === id)).toMatchObject({ durationMin: 45, done: true, stepId });
    expect(reloaded.workLogs).toEqual([expect.objectContaining({ taskId: id, minutes: 45, stepId })]);
  });

  it("工程の編集で1回の作業時間を変えても、指定しなければ保持する", () => {
    actions.saveStep({ id: stepId, goalId, title: "文法問題集", note: "", estimatedMinutes: 300, status: "todo", dependsOn: [], sessionMinutes: 30 });
    expect(step().sessionMinutes).toBe(30);
    actions.saveStep({ id: stepId, goalId, title: "文法問題集 改", note: "", estimatedMinutes: 300, status: "todo", dependsOn: [] });
    expect(step().sessionMinutes).toBe(30);
    expect(actions.saveStep({ id: stepId, goalId, title: "x", note: "", estimatedMinutes: 300, status: "todo", dependsOn: [], sessionMinutes: 2 }).ok).toBe(false);
  });
});
