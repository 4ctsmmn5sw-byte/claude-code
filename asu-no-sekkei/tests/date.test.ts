import { describe, expect, it } from "vitest";
import { addDays, formatDateLabel, isDateKey, nowMinutesInTokyo, relativeLabel, todayKey, weekdayOf } from "@/lib/date";

describe("Asia/Tokyo の日付", () => {
  it("UTC 14:59 は東京で同日 23:59、15:00 で翌日になる", () => {
    expect(todayKey(new Date("2026-10-14T14:59:00Z"))).toBe("2026-10-14");
    expect(nowMinutesInTokyo(new Date("2026-10-14T14:59:00Z"))).toBe(23 * 60 + 59);
    expect(todayKey(new Date("2026-10-14T15:00:00Z"))).toBe("2026-10-15");
    expect(nowMinutesInTokyo(new Date("2026-10-14T15:00:00Z"))).toBe(0);
  });
  it("端末のタイムゾーンに依存しない（UTC 午前は東京の同日）", () => {
    expect(todayKey(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});

describe("曜日と日付計算", () => {
  it("曜日を正しく求める", () => {
    expect(weekdayOf("2026-10-14")).toBe(3); // 水
    expect(weekdayOf("2026-10-18")).toBe(0); // 日
    expect(weekdayOf("2024-02-29")).toBe(4); // うるう日・木
  });
  it("月末・年末・うるう年をまたぐ加算", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });
  it("日曜→月曜で曜日が一周する", () => {
    expect(weekdayOf(addDays("2026-10-18", 1))).toBe(1);
    expect(weekdayOf(addDays("2026-10-17", 1))).toBe(0);
  });
  it("ラベル", () => {
    expect(formatDateLabel("2026-10-15")).toBe("10月15日（木）");
    expect(relativeLabel("2026-10-15", "2026-10-14")).toBe("明日");
    expect(relativeLabel("2026-10-14", "2026-10-14")).toBe("今日");
    expect(relativeLabel("2026-10-20", "2026-10-14")).toBeNull();
  });
  it("日付キーの検証", () => {
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2026-1-1")).toBe(false);
  });
});
