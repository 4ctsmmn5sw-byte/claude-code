const now = "2026-10-14T00:00:00.000Z";
const fx = (o: Record<string, unknown>) => ({ validFrom: null, validTo: null, skipDates: [], color: "slate", createdAt: now, updatedAt: now, ...o });
const tk = (o: Record<string, unknown>) => ({ color: "blue", done: false, date: null, startMin: null, createdAt: now, updatedAt: now, ...o });

/** 木曜 10/15：大学 9:00-12:00、アルバイト 18:00-21:00、配置済みタスク 3 件、未配置 2 件 */
export const SAMPLE = {
  schemaVersion: 2,
  settings: { snapMinutes: 5, pxPerMinute: 1.5 },
  fixedEvents: [
    fx({ id: "f1", title: "大学", weekdays: [1, 3, 4], startMin: 540, endMin: 720 }),
    fx({ id: "f2", title: "アルバイト", weekdays: [4], startMin: 1080, endMin: 1260, color: "stone" }),
  ],
  tasks: [
    tk({ id: "t1", title: "レポートの構成を考える", durationMin: 60, date: "2026-10-15", startMin: 780 }),
    tk({ id: "t2", title: "ジムで筋トレ", durationMin: 45, color: "green", done: true, date: "2026-10-15", startMin: 465 }),
    tk({ id: "t3", title: "メール返信", durationMin: 10, color: "amber", date: "2026-10-15", startMin: 735 }),
    tk({ id: "t4", title: "英単語 50個", durationMin: 30, color: "violet" }),
    tk({ id: "t5", title: "買い物リストを作る", durationMin: 15, color: "rose" }),
  ],
};
