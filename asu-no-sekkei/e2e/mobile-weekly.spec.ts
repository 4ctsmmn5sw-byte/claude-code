import { expect, test, type Page } from "@playwright/test";
import { block, center, freshStart, longPressDrag, scrollTimelineTo, touchSession } from "./helpers";

/** iPhone 14 サイズ：通常のタスクを毎週の固定予定に変える */

const now = "2026-10-14T00:00:00.000Z";
const tk = (o: Record<string, unknown>) => ({ color: "blue", done: false, date: null, startMin: null, createdAt: now, updatedAt: now, ...o });
const SEED = {
  schemaVersion: 2,
  settings: { snapMinutes: 5, pxPerMinute: 1.5 },
  fixedEvents: [],
  tasks: [
    tk({ id: "ic", title: "国際コミュニケーション論", durationMin: 100, date: "2026-10-15", startMin: 540 }),
    tk({ id: "rep", title: "レポート", durationMin: 30, date: "2026-10-28", startMin: 570, color: "amber" }),
    tk({ id: "eng", title: "英単語", durationMin: 30, color: "violet" }),
  ],
};

const blockHit = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^${title} \\d`) });
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("asu-no-sekkei:v1")!));
const next = async (page: Page, n = 1) => {
  for (let i = 0; i < n; i++) await page.getByRole("button", { name: "次の日" }).tap();
};
const prev = async (page: Page, n = 1) => {
  for (let i = 0; i < n; i++) await page.getByRole("button", { name: "前の日" }).tap();
};
const fixed = (page: Page, title: string) => page.getByTestId("fixed-event").filter({ hasText: title });
const IC = "国際コミュニケーション論";

test("通常タスク → 毎週水曜 9:00〜10:40 の固定予定。重複は警告のみ、休み・繰り返し終了・保存", async ({ page }) => {
  await freshStart(page, SEED);
  const cdp = await touchSession(page);
  await expect(page.getByTestId("current-date")).toContainText("10月15日（木）");

  // タスクをタップ → もう一度タップで編集
  await scrollTimelineTo(page, 9 * 60 + 30);
  await blockHit(page, IC).tap();
  await blockHit(page, IC).tap();
  const dialog = page.getByTestId("task-dialog");
  await expect(dialog.getByRole("radio", { name: "繰り返さない" })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("radio", { name: "毎週繰り返す" }).tap();

  // 初期値：表示中の日の曜日（木）・開始日 = その日・終了日は未指定
  const picker = dialog.getByTestId("weekday-picker");
  await expect(picker.getByRole("button", { name: "木", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByLabel("繰り返し開始日")).toHaveValue("2026-10-15");
  await expect(dialog.getByLabel("繰り返し終了日")).toHaveValue("");
  await expect(dialog.getByLabel("予定名")).toHaveValue(IC);
  await expect(dialog.getByLabel("開始", { exact: true })).toHaveValue("09:00");
  await expect(dialog.getByLabel("終了", { exact: true })).toHaveValue("10:40");
  await expect(dialog.getByTestId("conflict-warning")).toHaveCount(0);

  // 水曜に変更 → 10/28（水）のレポートと重なる警告（削除・移動はしない）
  await picker.getByRole("button", { name: "木", exact: true }).tap();
  await picker.getByRole("button", { name: "水", exact: true }).tap();
  const warning = dialog.getByTestId("conflict-warning");
  await expect(warning).toContainText("10月28日（水）");
  await expect(warning).toContainText("レポート");
  await expect(warning).toContainText("削除・移動しません");
  await dialog.getByRole("radio", { name: "藍" }).tap();
  await dialog.getByRole("button", { name: "重なりを確認して毎週の予定にする" }).tap();
  await expect(page.getByTestId("toast")).toContainText("毎週水 09:00–10:40の固定予定にしました");

  // 元のタスクは残らず、固定予定が 1 件だけ
  let data = await stored(page);
  expect(data.tasks.map((t: { id: string }) => t.id)).toEqual(["rep", "eng"]);
  expect(data.fixedEvents).toHaveLength(1);
  expect(data.fixedEvents[0]).toMatchObject({ title: IC, weekdays: [3], startMin: 540, endMin: 640, validFrom: "2026-10-15", validTo: null, color: "indigo" });
  await expect(block(page, IC)).toHaveCount(0);
  await expect(page.getByTestId("fixed-event")).toHaveCount(0); // 10/15 は木曜

  // 10/21（水）に鍵マーク付きで表示。長押ししても動かない
  await next(page, 6);
  await expect(page.getByTestId("current-date")).toContainText("10月21日（水）");
  await expect(fixed(page, IC)).toHaveAttribute("data-start", "540");
  await expect(fixed(page, IC)).toHaveAttribute("data-end", "640");
  await expect(fixed(page, IC).getByLabel("固定", { exact: true })).toBeVisible();
  await scrollTimelineTo(page, 9 * 60 + 50);
  const f = await center(fixed(page, IC));
  await longPressDrag(page, cdp, f, { x: f.x, y: f.y + 200 });
  await expect(fixed(page, IC)).toHaveAttribute("data-start", "540");

  // 10/28（水）：レポートは消えず・動かず、赤枠で警告
  await next(page, 7);
  await expect(fixed(page, IC)).toHaveCount(1);
  await expect(block(page, "レポート")).toHaveAttribute("data-start", "570");
  await expect(block(page, "レポート")).toContainText("他の予定と重複しています");

  // この日だけ休み → 10/28 だけ消え、レポートの重なりも解消。10/21 はそのまま
  // 重なったレポートがある部分を避け、固定予定の上端付近をタップ
  await scrollTimelineTo(page, 9 * 60 + 50);
  const fb = (await fixed(page, IC).boundingBox())!;
  await page.touchscreen.tap(fb.x + 150, fb.y + 12);
  const sheet = page.getByTestId("fixed-sheet");
  await expect(sheet.getByRole("button", { name: /毎週の繰り返しを終了する/ })).toBeVisible();
  await sheet.getByRole("button", { name: /この日だけ休みにする/ }).tap();
  await expect(page.getByTestId("fixed-event")).toHaveCount(0);
  await expect(page.getByTestId("skipped-fixed-event")).toHaveCount(1);
  await expect(block(page, "レポート")).not.toContainText("他の予定と重複しています");
  await prev(page, 7);
  await expect(fixed(page, IC)).toHaveCount(1);

  // 10/21 で「毎週の繰り返しを終了する」→「この日まで表示して、翌週から終了」
  await fixed(page, IC).getByRole("button").tap();
  await sheet.getByRole("button", { name: /毎週の繰り返しを終了する/ }).tap();
  await sheet.getByRole("button", { name: "この日まで表示して、翌週から終了" }).tap();
  await expect(page.getByTestId("toast")).toContainText("10月21日（水）までで終了しました");
  await expect(fixed(page, IC)).toHaveCount(1); // この日は表示されたまま
  await next(page, 14);
  await expect(page.getByTestId("current-date")).toContainText("11月4日（水）");
  await expect(page.getByTestId("fixed-event")).toHaveCount(0);

  // 再読み込み後も保存されている（休みの日・終了日・他のタスク）
  await page.reload();
  data = await stored(page);
  expect(data.fixedEvents[0]).toMatchObject({ validTo: "2026-10-21", skipDates: ["2026-10-28"] });
  expect(data.tasks.map((t: { id: string }) => t.id)).toEqual(["rep", "eng"]);
  expect(data.settings).toEqual({ snapMinutes: 5, pxPerMinute: 1.5 });
  await next(page, 6);
  await expect(fixed(page, IC)).toHaveCount(1);
});

test("未配置タスクを月・水の毎週の予定に。取り消しで元のタスクに戻る", async ({ page }) => {
  await freshStart(page, SEED);
  const toWeekly = async () => {
    await page.getByRole("button", { name: /^タスク一覧/ }).tap();
    await page.getByRole("button", { name: "英単語を編集" }).tap();
    const dialog = page.getByTestId("task-dialog");
    await dialog.getByRole("radio", { name: "毎週繰り返す" }).tap();
    const picker = dialog.getByTestId("weekday-picker");
    await picker.getByRole("button", { name: "木", exact: true }).tap();
    await picker.getByRole("button", { name: "月", exact: true }).tap();
    await picker.getByRole("button", { name: "水", exact: true }).tap();
    return dialog;
  };

  // 開始時刻がないと保存できない
  let dialog = await toWeekly();
  await dialog.getByRole("button", { name: "毎週の予定にする" }).tap();
  await expect(dialog).toContainText("開始時刻と終了時刻を入力してください");
  await dialog.getByLabel("開始", { exact: true }).fill("13:00");
  await dialog.getByLabel("終了", { exact: true }).fill("14:30");
  await dialog.getByRole("button", { name: "毎週の予定にする" }).tap();

  // すぐ「元に戻す」→ 元のタスクに戻り、固定予定は残らない
  await page.getByTestId("toast").getByRole("button", { name: "元に戻す" }).tap();
  let data = await stored(page);
  expect(data.fixedEvents).toHaveLength(0);
  expect(data.tasks.find((t: { id: string }) => t.id === "eng")).toMatchObject({ title: "英単語", durationMin: 30, startMin: null });

  // もう一度、終了日つきで変換
  dialog = await toWeekly();
  await dialog.getByLabel("開始", { exact: true }).fill("13:00");
  await dialog.getByLabel("終了", { exact: true }).fill("14:30");
  await dialog.getByLabel("繰り返し終了日").fill("2026-11-30");
  await dialog.getByRole("button", { name: "毎週の予定にする" }).tap();
  await expect(page.getByTestId("toast")).toContainText("毎週月・水 13:00–14:30");
  await expect(page.getByTestId("unplaced-task")).toHaveCount(0);
  data = await stored(page);
  expect(data.tasks.map((t: { id: string }) => t.id)).toEqual(["ic", "rep"]);
  expect(data.fixedEvents).toHaveLength(1);
  expect(data.fixedEvents[0]).toMatchObject({ weekdays: [1, 3], startMin: 780, endMin: 870, validFrom: "2026-10-15", validTo: "2026-11-30" });

  // 月・水に表示、火には出ない。終了日（11/30）より後の水曜（12/2）にも出ない
  await next(page, 4);
  await expect(page.getByTestId("current-date")).toContainText("10月19日（月）");
  await expect(fixed(page, "英単語")).toHaveCount(1);
  await next(page);
  await expect(fixed(page, "英単語")).toHaveCount(0);
  await next(page);
  await expect(fixed(page, "英単語")).toHaveCount(1);
  await next(page, 42);
  await expect(page.getByTestId("current-date")).toContainText("12月2日（水）");
  await expect(fixed(page, "英単語")).toHaveCount(0);
});

test("設定画面で曜日を変更して既存タスクと重なる場合も、警告するだけでタスクは動かさない", async ({ page }) => {
  const seed = {
    ...SEED,
    fixedEvents: [
      { id: "f", title: "ゼミ", weekdays: [1], startMin: 540, endMin: 600, color: "slate", validFrom: null, validTo: null, skipDates: [], createdAt: now, updatedAt: now },
    ],
  };
  await freshStart(page, seed);
  await page.goto("/settings?edit=f");
  const form = page.getByTestId("fixed-form");
  await expect(form.getByTestId("conflict-warning")).toHaveCount(0);
  await form.getByTestId("weekday-picker").getByRole("button", { name: "水", exact: true }).tap();
  await expect(form.getByTestId("conflict-warning")).toContainText("10月28日（水）");
  await expect(form.getByTestId("conflict-warning")).toContainText("レポート");
  await form.getByRole("button", { name: "重なりを確認して更新" }).tap();
  const data = await stored(page);
  expect(data.fixedEvents[0].weekdays).toEqual([1, 3]);
  expect(data.tasks.find((t: { id: string }) => t.id === "rep")).toMatchObject({ date: "2026-10-28", startMin: 570 });
});
