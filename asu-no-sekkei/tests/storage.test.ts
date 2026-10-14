import { beforeEach, describe, expect, it } from "vitest";
import { parseAppData, type Repository } from "@/lib/storage";
import { actions } from "@/lib/store";
import type { AppData } from "@/lib/types";

describe("parseAppData", () => {
  it("未保存なら空データ", () => {
    const r = parseAppData(null);
    expect(r.data.tasks).toEqual([]);
    expect(r.data.settings.snapMinutes).toBe(5);
    expect(r.warning).toBeNull();
  });
  it("壊れた JSON でも例外を投げず空データと警告を返す", () => {
    const r = parseAppData("{not json");
    expect(r.data.tasks).toEqual([]);
    expect(r.warning).not.toBeNull();
  });
  it("不正な項目だけを除外する", () => {
    const r = parseAppData(
      JSON.stringify({
        tasks: [
          { id: "ok", title: "A", durationMin: 30, color: "blue", done: false, date: "2026-10-15", startMin: 600 },
          { id: 1, title: "bad" },
          { id: "half", title: "B", durationMin: 30, date: "2026-10-15", startMin: null },
          { id: "over", title: "C", durationMin: 60, date: "2026-10-15", startMin: 1430 },
        ],
        fixedEvents: [
          { id: "f", title: "大学", weekdays: [1, 3], startMin: 540, endMin: 720, color: "slate" },
          { id: "g", title: "逆", weekdays: [1], startMin: 720, endMin: 540 },
        ],
        settings: { snapMinutes: 1 },
      }),
    );
    expect(r.data.tasks.map((t) => t.id)).toEqual(["ok", "half", "over"]);
    expect(r.data.tasks[1].startMin).toBeNull();
    expect(r.data.tasks[2].startMin).toBeNull(); // 24:00 を超える配置は未配置に戻す
    expect(r.data.fixedEvents.map((e) => e.id)).toEqual(["f"]);
    expect(r.data.settings.snapMinutes).toBe(1);
    expect(r.warning).toContain("2件");
  });
});

class MemoryRepository implements Repository {
  saved: AppData | null = null;
  load() {
    return parseAppData(this.saved ? JSON.stringify(this.saved) : null);
  }
  save(data: AppData) {
    this.saved = JSON.parse(JSON.stringify(data));
  }
}

describe("store actions", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
    actions._setRepository(repo);
  });

  it("追加したタスクは未配置で保存され、再読み込み後も残る", () => {
    expect(actions.addTask({ title: "レポート", durationMin: 45, color: "blue" }).ok).toBe(true);
    expect(repo.saved?.tasks[0]).toMatchObject({ title: "レポート", durationMin: 45, date: null, startMin: null });
    actions._setRepository(repo); // 再読み込み相当
    expect(repo.load().data.tasks).toHaveLength(1);
  });

  it("重複する配置は保存しない", () => {
    actions.saveFixedEvent({ title: "大学", weekdays: [1, 3], startMin: 540, endMin: 720, color: "slate" });
    actions.addTask({ title: "A", durationMin: 60, color: "blue" });
    const id = repo.saved!.tasks[0].id;
    const r = actions.placeTask(id, "2026-10-14", 700, 60); // 水曜
    expect(r.ok).toBe(false);
    expect(repo.saved!.tasks[0].startMin).toBeNull();
    expect(actions.placeTask(id, "2026-10-14", 720, 60).ok).toBe(true);
    expect(repo.saved!.tasks[0]).toMatchObject({ date: "2026-10-14", startMin: 720 });
  });

  it("固定予定は日付ごとにコピーせず 1 件の規則として保存する", () => {
    actions.saveFixedEvent({ title: "大学", weekdays: [1, 3], startMin: 540, endMin: 720, color: "slate" });
    expect(repo.saved!.fixedEvents).toHaveLength(1);
    const id = repo.saved!.fixedEvents[0].id;
    actions.saveFixedEvent({ id, title: "大学", weekdays: [1, 3, 5], startMin: 540, endMin: 750, color: "slate" });
    expect(repo.saved!.fixedEvents).toHaveLength(1);
    expect(repo.saved!.fixedEvents[0]).toMatchObject({ weekdays: [1, 3, 5], endMin: 750 });
  });

  it("未配置に戻す・完了・削除", () => {
    actions.addTask({ title: "A", durationMin: 30, color: "blue" });
    const id = repo.saved!.tasks[0].id;
    actions.placeTask(id, "2026-10-15", 600, 30);
    actions.toggleDone(id);
    expect(repo.saved!.tasks[0].done).toBe(true);
    actions.unplaceTask(id);
    expect(repo.saved!.tasks[0]).toMatchObject({ date: null, startMin: null });
    actions.deleteTask(id);
    expect(repo.saved!.tasks).toHaveLength(0);
  });
});
