import { describe, expect, it } from "vitest";
import { formatMinutes, parseTime, pointerToStartMinutes, PX_PER_MINUTE, snap, yToMinutes } from "@/lib/time";

describe("parseTime / formatMinutes", () => {
  it("さまざまな書式を分に変換する", () => {
    expect(parseTime("9:05")).toBe(545);
    expect(parseTime("09:05")).toBe(545);
    expect(parseTime("0905")).toBe(545);
    expect(parseTime("905")).toBe(545);
    expect(parseTime("9")).toBe(540);
    expect(parseTime("２３：５９")).toBe(1439);
  });
  it("24:00 は終了時刻でのみ許可する", () => {
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("24:00", { allow24: true })).toBe(1440);
    expect(parseTime("24:01", { allow24: true })).toBeNull();
  });
  it("不正な値は null", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("9:60")).toBeNull();
    expect(parseTime("25:00", { allow24: true })).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
  it("分を HH:MM に整形する", () => {
    expect(formatMinutes(0)).toBe("00:00");
    expect(formatMinutes(545)).toBe("09:05");
    expect(formatMinutes(1440)).toBe("24:00");
  });
});

describe("座標 → 時刻", () => {
  it("刻みに丸める", () => {
    expect(snap(62, 5)).toBe(60);
    expect(snap(63, 5)).toBe(65);
    expect(snap(63.4, 1)).toBe(63);
  });
  it("Y 座標を分に換算する", () => {
    expect(yToMinutes(600 * PX_PER_MINUTE)).toBe(600);
  });
  it("スクロール量（タイムライン上端の位置）が違っても同じ時刻になる", () => {
    const grab = 10;
    // 9:00 の位置にタスク上端が来るポインタ位置を、2 通りのスクロール状態で計算
    const target = 540 * PX_PER_MINUTE;
    for (const timelineTop of [120, -480, -1100.5]) {
      const pointerY = timelineTop + target + grab;
      expect(pointerToStartMinutes(pointerY, timelineTop, grab, 60, 5)).toBe(540);
    }
  });
  it("0:00 より前・24:00 を超える開始は範囲内に収める", () => {
    expect(pointerToStartMinutes(-500, 0, 0, 30, 5)).toBe(0);
    expect(pointerToStartMinutes(99999, 0, 0, 30, 5)).toBe(1410);
  });
  it("1 分刻みでは端数をそのまま使う", () => {
    const top = 50;
    const y = top + 543 * PX_PER_MINUTE;
    expect(pointerToStartMinutes(y, top, 0, 30, 1)).toBe(543);
    expect(pointerToStartMinutes(y, top, 0, 30, 5)).toBe(545);
  });
});
