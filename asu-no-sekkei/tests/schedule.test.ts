import { describe, expect, it } from "vitest";
import { checkPlacement, conflictingTaskIds, fixedEventsForDate, overlaps } from "@/lib/schedule";
import type { FixedEvent, Task } from "@/lib/types";

const now = "2026-10-14T00:00:00.000Z";
const univ: FixedEvent = {
  id: "f1", title: "大学", weekdays: [1, 3], startMin: 540, endMin: 720, color: "slate", createdAt: now, updatedAt: now,
};
const task = (id: string, date: string | null, startMin: number | null, durationMin = 60): Task => ({
  id, title: id, durationMin, color: "blue", done: false, date, startMin, createdAt: now, updatedAt: now,
});

describe("固定予定の展開", () => {
  it("月・水だけに表示される", () => {
    expect(fixedEventsForDate([univ], "2026-10-12").map((e) => e.id)).toEqual(["f1"]); // 月
    expect(fixedEventsForDate([univ], "2026-10-13")).toEqual([]); // 火
    expect(fixedEventsForDate([univ], "2026-10-14").map((e) => e.id)).toEqual(["f1"]); // 水
    expect(fixedEventsForDate([univ], "2026-10-19").map((e) => e.id)).toEqual(["f1"]); // 翌週の月
  });
});

describe("重複判定", () => {
  it("隣接は重複ではない", () => {
    expect(overlaps(0, 60, 60, 120)).toBe(false);
    expect(overlaps(0, 61, 60, 120)).toBe(true);
  });
  it("固定予定と重なる配置を拒否する", () => {
    const r = checkPlacement([task("a", null, null)], [univ], "2026-10-14", "a", 690, 750);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("大学");
  });
  it("固定予定がない曜日なら同じ時刻に置ける", () => {
    expect(checkPlacement([task("a", null, null)], [univ], "2026-10-13", "a", 690, 750).ok).toBe(true);
  });
  it("他のタスクとの重複を拒否し、自分自身は除外する", () => {
    const tasks = [task("a", "2026-10-13", 600), task("b", null, null)];
    expect(checkPlacement(tasks, [], "2026-10-13", "b", 630, 690).ok).toBe(false);
    expect(checkPlacement(tasks, [], "2026-10-13", "a", 630, 690).ok).toBe(true);
    expect(checkPlacement(tasks, [], "2026-10-14", "b", 630, 690).ok).toBe(true);
  });
  it("0:00〜24:00 の外は拒否する", () => {
    expect(checkPlacement([], [], "2026-10-13", "x", -5, 30).ok).toBe(false);
    expect(checkPlacement([], [], "2026-10-13", "x", 1420, 1445).ok).toBe(false);
    expect(checkPlacement([], [], "2026-10-13", "x", 1380, 1440).ok).toBe(true);
    expect(checkPlacement([], [], "2026-10-13", "x", 600, 600).ok).toBe(false);
  });
  it("後から固定予定を追加して重なったタスクを検出する", () => {
    const tasks = [task("a", "2026-10-14", 600)];
    expect([...conflictingTaskIds(tasks, [univ], "2026-10-14")]).toEqual(["a"]);
  });
});
