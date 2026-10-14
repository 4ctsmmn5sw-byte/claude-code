import { beforeEach, describe, expect, it } from "vitest";
import { fixedEventsForDate, ruleConflicts, skippedFixedEventsForDate, type WeeklyRule } from "@/lib/schedule";
import { parseAppData, type Repository } from "@/lib/storage";
import { actions } from "@/lib/store";
import type { AppData, Weekday } from "@/lib/types";

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
const task = (o: Record<string, unknown>) => ({ color: "blue", done: false, date: null, startMin: null, durationMin: 60, createdAt: now, updatedAt: now, ...o });

/** 国際コミュニケーション論：10/15（木）9:00〜10:40 に配置済みの通常タスク */
const SEED = {
  schemaVersion: 2,
  settings: { snapMinutes: 1, pxPerMinute: 2 },
  fixedEvents: [
    { id: "f1", title: "アルバイト", weekdays: [5], startMin: 1080, endMin: 1260, color: "stone", validFrom: null, validTo: null, skipDates: ["2026-10-16"], createdAt: now, updatedAt: now },
  ],
  tasks: [
    task({ id: "ic", title: "国際コミュニケーション論", durationMin: 100, date: "2026-10-15", startMin: 540 }),
    task({ id: "rep", title: "レポート", durationMin: 30, date: "2026-10-28", startMin: 570 }),
    task({ id: "other", title: "英単語", durationMin: 30 }),
  ],
};

const WED: Weekday = 3;

describe("通常のタスク → 毎週の固定予定", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository(SEED);
    actions._setRepository(repo);
  });

  const convert = (o: Record<string, unknown> = {}) =>
    actions.convertTaskToWeekly("ic", {
      title: "国際コミュニケーション論",
      weekdays: [WED],
      startMin: 540,
      endMin: 640,
      color: "indigo",
      validFrom: "2026-10-15",
      validTo: null,
      ...o,
    });

  it("固定予定（規則）を 1 件だけ作り、元のタスクは残らない", () => {
    const r = convert();
    expect(r.ok).toBe(true);
    const saved = repo.saved!;
    expect(saved.tasks.map((t) => t.id)).toEqual(["rep", "other"]);
    expect(saved.fixedEvents).toHaveLength(2);
    const ev = saved.fixedEvents.find((e) => e.title === "国際コミュニケーション論")!;
    expect(ev).toMatchObject({ weekdays: [WED], startMin: 540, endMin: 640, validFrom: "2026-10-15", validTo: null, skipDates: [], color: "indigo" });
  });

  it("今後の水曜日に自動表示され、開始日前・他の曜日には出ない（日付ごとの複製なし）", () => {
    convert();
    const events = repo.saved!.fixedEvents;
    expect(fixedEventsForDate(events, "2026-10-14").some((e) => e.title === "国際コミュニケーション論")).toBe(false); // 開始日前の水曜
    for (const wed of ["2026-10-21", "2026-10-28", "2027-03-03"]) {
      expect(fixedEventsForDate(events, wed).map((e) => e.title)).toContain("国際コミュニケーション論");
    }
    expect(fixedEventsForDate(events, "2026-10-22").map((e) => e.title)).not.toContain("国際コミュニケーション論");
  });

  it("複数の曜日に反映される", () => {
    convert({ weekdays: [1, WED, 5] });
    const events = repo.saved!.fixedEvents;
    expect(fixedEventsForDate(events, "2026-10-19").map((e) => e.title)).toContain("国際コミュニケーション論"); // 月
    expect(fixedEventsForDate(events, "2026-10-21").map((e) => e.title)).toContain("国際コミュニケーション論"); // 水
    expect(fixedEventsForDate(events, "2026-10-23").map((e) => e.title)).toContain("国際コミュニケーション論"); // 金
    expect(fixedEventsForDate(events, "2026-10-20").map((e) => e.title)).not.toContain("国際コミュニケーション論"); // 火
  });

  it("繰り返し終了日の後は表示されない（終了日当日は表示）", () => {
    convert({ validTo: "2026-11-04" });
    const events = repo.saved!.fixedEvents;
    expect(fixedEventsForDate(events, "2026-11-04").map((e) => e.title)).toContain("国際コミュニケーション論");
    expect(fixedEventsForDate(events, "2026-11-11").map((e) => e.title)).not.toContain("国際コミュニケーション論");
  });

  it("入力が不正なら変換せず、タスクも消さない", () => {
    expect(convert({ weekdays: [] }).ok).toBe(false);
    expect(convert({ validFrom: null }).ok).toBe(false);
    expect(convert({ validFrom: "2026-11-01", validTo: "2026-10-01" }).ok).toBe(false);
    expect(convert({ startMin: 600, endMin: 600 }).ok).toBe(false);
    expect(convert({ title: "  " }).ok).toBe(false);
    expect(repo.saved!.tasks.map((t) => t.id)).toContain("ic");
    expect(repo.saved!.fixedEvents).toHaveLength(1);
  });

  it("取り消すと元のタスクに戻り、固定予定は消える", () => {
    const r = convert();
    actions.undoConvertTask(r.eventId!, r.task!);
    expect(repo.saved!.tasks.find((t) => t.id === "ic")).toMatchObject({ date: "2026-10-15", startMin: 540, durationMin: 100 });
    expect(repo.saved!.fixedEvents.map((e) => e.id)).toEqual(["f1"]);
  });

  it("重なる既存タスクは削除・移動しない（警告用に検出だけする）", () => {
    const rule: WeeklyRule = { weekdays: [WED], startMin: 540, endMin: 640, validFrom: "2026-10-15", validTo: null };
    const c = ruleConflicts(rule, repo.saved!.tasks, repo.saved!.fixedEvents, { excludeTaskId: "ic" });
    expect(c.tasks.map((t) => t.id)).toEqual(["rep"]); // 10/28（水）9:30 のレポート
    convert();
    expect(repo.saved!.tasks.find((t) => t.id === "rep")).toMatchObject({ date: "2026-10-28", startMin: 570 });
    // 終了日を 10/21 にすれば重ならない
    expect(ruleConflicts({ ...rule, validTo: "2026-10-21" }, repo.saved!.tasks, []).tasks).toEqual([]);
    // 曜日を木曜に変えると重ならない
    expect(ruleConflicts({ ...rule, weekdays: [4] }, repo.saved!.tasks, []).tasks).toEqual([]);
  });

  it("他の固定予定との重なりも検出する（曜日・時間・期間がすべて重なる場合）", () => {
    const events = repo.saved!.fixedEvents;
    expect(ruleConflicts({ weekdays: [5], startMin: 1200, endMin: 1290, validFrom: null, validTo: null }, [], events).fixed).toHaveLength(1);
    expect(ruleConflicts({ weekdays: [4], startMin: 1200, endMin: 1290, validFrom: null, validTo: null }, [], events).fixed).toHaveLength(0);
  });
});

describe("固定予定の操作（変換後も既存の仕組みを使う）", () => {
  let repo: MemoryRepository;
  let id: string;
  beforeEach(() => {
    repo = new MemoryRepository(SEED);
    actions._setRepository(repo);
    id = actions.convertTaskToWeekly("ic", {
      title: "国際コミュニケーション論", weekdays: [WED], startMin: 540, endMin: 640, color: "indigo", validFrom: "2026-10-15", validTo: null,
    }).eventId!;
  });

  it("この日だけ休み：その日だけ消え、他の週と毎週の設定は変わらない", () => {
    actions.skipFixedEventOn(id, "2026-10-21");
    const events = repo.saved!.fixedEvents;
    expect(fixedEventsForDate(events, "2026-10-21").map((e) => e.id)).not.toContain(id);
    expect(skippedFixedEventsForDate(events, "2026-10-21").map((e) => e.id)).toContain(id);
    expect(fixedEventsForDate(events, "2026-10-28").map((e) => e.id)).toContain(id);
    expect(events.find((e) => e.id === id)).toMatchObject({ weekdays: [WED], startMin: 540, endMin: 640, validTo: null });
  });

  it("毎週の繰り返しを終了：指定日まで残り、それ以降は表示しない。取り消しもできる", () => {
    const r = actions.endFixedEventRepeat(id, "2026-10-27");
    expect(r.ok).toBe(true);
    let events = repo.saved!.fixedEvents;
    expect(fixedEventsForDate(events, "2026-10-21").map((e) => e.id)).toContain(id);
    expect(fixedEventsForDate(events, "2026-10-28").map((e) => e.id)).not.toContain(id);
    expect(events.find((e) => e.id === id)!.validTo).toBe("2026-10-27");
    actions.setFixedEventValidTo(id, r.previousValidTo ?? null);
    events = repo.saved!.fixedEvents;
    expect(fixedEventsForDate(events, "2026-10-28").map((e) => e.id)).toContain(id);
  });

  it("繰り返し開始日より前で終了しようとすると拒否する（データは消さない）", () => {
    expect(actions.endFixedEventRepeat(id, "2026-10-14").ok).toBe(false);
    expect(repo.saved!.fixedEvents.find((e) => e.id === id)!.validTo).toBeNull();
  });

  it("保存データを読み直しても内容が残る（既存のタスク・固定予定・設定も保持）", () => {
    const reloaded = parseAppData(JSON.stringify(repo.saved)).data;
    expect(reloaded.settings).toEqual({ snapMinutes: 1, pxPerMinute: 2 });
    expect(reloaded.fixedEvents.map((e) => e.title)).toEqual(["アルバイト", "国際コミュニケーション論"]);
    expect(reloaded.fixedEvents[0].skipDates).toEqual(["2026-10-16"]);
    expect(reloaded.tasks.map((t) => t.id)).toEqual(["rep", "other"]);
  });
});

describe("既存の保存データの読み込み", () => {
  it("現在公開中の形式（v2）はそのまま読み込める", () => {
    const r = parseAppData(JSON.stringify(SEED));
    expect(r.warning).toBeNull();
    expect(r.data.tasks).toHaveLength(3);
    expect(r.data.fixedEvents[0]).toMatchObject({ id: "f1", skipDates: ["2026-10-16"] });
    expect(r.data.settings).toEqual({ snapMinutes: 1, pxPerMinute: 2 });
  });
});
