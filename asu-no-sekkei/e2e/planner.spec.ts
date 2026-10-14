import { expect, test } from "@playwright/test";
import { addTask, block, freshStart, mouseDrag, PX, scrollTimelineTo, timelineTop } from "./helpers";

test.describe("タイムライン（PC）", () => {
  test("初期表示は明日・2カラム・日付切替", async ({ page }) => {
    await freshStart(page);
    await expect(page.getByTestId("current-date")).toContainText("10月15日（木）");
    await expect(page.getByTestId("current-date")).toContainText("明日");
    await expect(page.getByTestId("task-panel")).toBeVisible();
    await page.getByRole("button", { name: "次の日" }).click();
    await expect(page.getByTestId("current-date")).toContainText("10月16日（金）");
    await page.getByRole("button", { name: "今日", exact: true }).click();
    await expect(page.getByTestId("current-date")).toContainText("10月14日（水）");
    await page.getByRole("button", { name: "前の日" }).click();
    await expect(page.getByTestId("current-date")).toContainText("10月13日（火）");
    await page.getByRole("button", { name: "明日", exact: true }).click();
    await expect(page.getByTestId("current-date")).toContainText("10月15日（木）");
  });

  test("未配置タスクをドロップした位置の時刻に正確に配置される（スクロール位置が違っても）", async ({ page }) => {
    await freshStart(page);
    await addTask(page, "レポート", 60);
    await addTask(page, "読書", 30);

    // 1件目：タイムラインを 8:00 付近までスクロールして 9:35 に配置
    await scrollTimelineTo(page, 8 * 60);
    let top = await timelineTop(page);
    let card = await page.getByTestId("unplaced-task").filter({ hasText: "レポート" }).boundingBox();
    // 未配置からのドラッグでは、ポインタがタスク上端から 12px 下に来る
    await mouseDrag(page, { x: card!.x + 40, y: card!.y + card!.height / 2 }, { x: top.x + 200, y: top.y + (9 * 60 + 35) * PX + 12 });
    await expect(block(page, "レポート")).toHaveAttribute("data-start", String(9 * 60 + 35));
    await expect(block(page, "レポート")).toHaveAttribute("data-end", String(10 * 60 + 35));

    // 2件目：別のスクロール位置（17:00 付近）で 18:10 に配置
    await scrollTimelineTo(page, 17 * 60);
    top = await timelineTop(page);
    card = await page.getByTestId("unplaced-task").filter({ hasText: "読書" }).boundingBox();
    await mouseDrag(page, { x: card!.x + 40, y: card!.y + card!.height / 2 }, { x: top.x + 300, y: top.y + (18 * 60 + 10) * PX + 12 });
    await expect(block(page, "読書")).toHaveAttribute("data-start", String(18 * 60 + 10));
    await expect(page.getByTestId("unplaced-task")).toHaveCount(0);

    // 再読み込み後も残る
    await page.reload();
    await expect(block(page, "レポート")).toHaveAttribute("data-start", "575");
    await expect(block(page, "読書")).toHaveAttribute("data-start", "1090");
  });

  test("配置済みタスクのドラッグ移動（掴んだ位置を保つ）と下端での伸縮", async ({ page }) => {
    await freshStart(page);
    await addTask(page, "勉強", 60);
    await scrollTimelineTo(page, 9 * 60);
    let top = await timelineTop(page);
    const card = await page.getByTestId("unplaced-task").first().boundingBox();
    await mouseDrag(page, { x: card!.x + 40, y: card!.y + 20 }, { x: top.x + 200, y: top.y + 600 * PX + 12 });
    await expect(block(page, "勉強")).toHaveAttribute("data-start", "600");

    // 中ほどを掴んで 45 分下へ
    const b = await block(page, "勉強").boundingBox();
    const grabY = b!.y + 40;
    await mouseDrag(page, { x: b!.x + 150, y: grabY }, { x: b!.x + 150, y: grabY + 45 * PX });
    await expect(block(page, "勉強")).toHaveAttribute("data-start", "645");
    await expect(block(page, "勉強")).toHaveAttribute("data-end", "705");

    // 下端ハンドルで 12:20 まで伸ばす（5分刻み）
    top = await timelineTop(page);
    const handle = await block(page, "勉強").getByTestId("resize-handle").boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width / 2, top.y + (12 * 60 + 21) * PX, { steps: 10 });
    await page.mouse.up();
    await expect(block(page, "勉強")).toHaveAttribute("data-end", String(12 * 60 + 20));
    await page.reload();
    await expect(block(page, "勉強")).toHaveAttribute("data-end", "740");
  });

  test("1分刻み設定と時刻の直接入力", async ({ page }) => {
    await freshStart(page);
    await page.getByRole("link", { name: "固定予定・設定" }).click();
    await page.getByRole("radio", { name: "1分刻み" }).click();
    await page.getByRole("link", { name: "タイムラインへ" }).click();
    await expect(page.getByText("1分刻み")).toBeVisible();

    await addTask(page, "メール", 20);
    await scrollTimelineTo(page, 8 * 60);
    const top = await timelineTop(page);
    const card = await page.getByTestId("unplaced-task").first().boundingBox();
    await mouseDrag(page, { x: card!.x + 40, y: card!.y + 20 }, { x: top.x + 200, y: top.y + 543 * PX + 12 });
    await expect(block(page, "メール")).toHaveAttribute("data-start", "543");

    // 編集ダイアログで 13:07〜13:52 に直接入力
    await block(page, "メール").getByRole("button", { name: /メール/ }).click();
    const dialog = page.getByTestId("task-dialog");
    await dialog.getByLabel("開始").fill("13:07");
    await dialog.getByLabel("終了").fill("13:52");
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(block(page, "メール")).toHaveAttribute("data-start", String(13 * 60 + 7));
    await expect(block(page, "メール")).toHaveAttribute("data-end", String(13 * 60 + 52));
  });

  test("曜日別の固定予定（月・水 9:00〜12:00 大学）と重複防止", async ({ page }) => {
    await freshStart(page);
    await page.getByRole("link", { name: "固定予定・設定" }).click();
    await page.getByRole("button", { name: "＋ 固定予定を追加" }).click();
    const form = page.getByTestId("fixed-form");
    await form.getByLabel("予定名").fill("大学");
    await form.getByRole("button", { name: "月", exact: true }).click();
    await form.getByRole("button", { name: "水", exact: true }).click();
    await form.getByLabel("開始").fill("9:00");
    await form.getByLabel("終了").fill("12:00");
    await form.getByRole("button", { name: "登録" }).click();
    await expect(page.getByTestId("fixed-list")).toContainText("月・水");
    await page.getByRole("link", { name: "タイムラインへ" }).click();

    // 10/15（木）には表示されない
    await expect(page.getByTestId("fixed-event")).toHaveCount(0);
    // 10/14（水）・10/19（月）・10/21（水）には表示される
    await page.getByRole("button", { name: "今日", exact: true }).click();
    await expect(page.getByTestId("fixed-event")).toHaveCount(1);
    await expect(page.getByTestId("fixed-event")).toContainText("大学");
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "次の日" }).click();
    await expect(page.getByTestId("current-date")).toContainText("10月19日（月）");
    await expect(page.getByTestId("fixed-event")).toHaveCount(1);
    await page.getByRole("button", { name: "次の日" }).click();
    await expect(page.getByTestId("fixed-event")).toHaveCount(0);
    await page.getByRole("button", { name: "次の日" }).click();
    await expect(page.getByTestId("fixed-event")).toHaveCount(1);

    // 固定予定に重なるドロップは拒否され、未配置のまま
    await addTask(page, "課題", 60);
    await scrollTimelineTo(page, 11 * 60);
    const top = await timelineTop(page);
    const card = await page.getByTestId("unplaced-task").first().boundingBox();
    await mouseDrag(page, { x: card!.x + 40, y: card!.y + 20 }, { x: top.x + 200, y: top.y + 11 * 60 * PX + 12 });
    await expect(page.getByTestId("toast")).toContainText("大学");
    await expect(page.getByTestId("task-block")).toHaveCount(0);
    await expect(page.getByTestId("unplaced-task")).toHaveCount(1);

    // 固定予定は掴んでも動かない
    const fixed = await page.getByTestId("fixed-event").boundingBox();
    await mouseDrag(page, { x: fixed!.x + 100, y: fixed!.y + 30 }, { x: fixed!.x + 100, y: fixed!.y + 300 });
    await expect(page.getByTestId("fixed-event")).toHaveAttribute("data-start", "540");

    // 12:00 ちょうどからは置ける（隣接は重複扱いしない）
    await scrollTimelineTo(page, 12 * 60);
    const card2 = await page.getByTestId("unplaced-task").first().boundingBox();
    const top2 = await timelineTop(page);
    await mouseDrag(page, { x: card2!.x + 40, y: card2!.y + 20 }, { x: top2.x + 200, y: top2.y + 12 * 60 * PX + 12 });
    await expect(block(page, "課題")).toHaveAttribute("data-start", "720");

    // 固定予定を 9:00〜13:00 に変更すると、将来の表示に反映され、重なるタスクに警告が出る
    await page.getByRole("link", { name: "固定予定・設定" }).click();
    await page.getByTestId("fixed-list").getByRole("button", { name: "編集" }).click();
    await page.getByTestId("fixed-form").getByLabel("終了").fill("13:00");
    await page.getByTestId("fixed-form").getByRole("button", { name: "更新" }).click();
    await page.getByRole("link", { name: "タイムラインへ" }).click();
    for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "次の日" }).click();
    await expect(page.getByTestId("current-date")).toContainText("10月21日（水）");
    await expect(page.getByTestId("fixed-event")).toHaveAttribute("data-end", "780");
    await expect(page.getByText("重複 1件")).toBeVisible();
  });

  test("他タスクとの重複・24:00 超えを防止、未配置へ戻す・完了・削除", async ({ page }) => {
    await freshStart(page);
    await addTask(page, "A", 60);
    await addTask(page, "B", 90);
    await scrollTimelineTo(page, 20 * 60);
    let top = await timelineTop(page);
    let card = await page.getByTestId("unplaced-task").filter({ hasText: "A" }).boundingBox();
    await mouseDrag(page, { x: card!.x + 40, y: card!.y + 20 }, { x: top.x + 200, y: top.y + 21 * 60 * PX + 12 });
    await expect(block(page, "A")).toHaveAttribute("data-start", "1260");

    // B（90分）を 21:30 に置こうとすると A と重なる
    card = await page.getByTestId("unplaced-task").filter({ hasText: "B" }).boundingBox();
    await mouseDrag(page, { x: card!.x + 40, y: card!.y + 20 }, { x: top.x + 200, y: top.y + (21 * 60 + 30) * PX + 12 });
    await expect(page.getByTestId("toast")).toContainText("「A」");
    await expect(page.getByTestId("task-block")).toHaveCount(1);

    // 23:50 付近に落としても 24:00 を超えないよう 22:30 に収まる（22:30〜24:00 は空き）
    await scrollTimelineTo(page, 24 * 60);
    top = await timelineTop(page);
    card = await page.getByTestId("unplaced-task").filter({ hasText: "B" }).boundingBox();
    await mouseDrag(page, { x: card!.x + 40, y: card!.y + 20 }, { x: top.x + 200, y: top.y + (23 * 60 + 50) * PX });
    await expect(block(page, "B")).toHaveAttribute("data-start", String(22 * 60 + 30));
    await expect(block(page, "B")).toHaveAttribute("data-end", "1440");

    // 直接入力で 24:00 を超える時刻は拒否
    await block(page, "B").getByRole("button", { name: /^B / }).click();
    const dialog = page.getByTestId("task-dialog");
    await dialog.getByLabel("開始").fill("23:00");
    await expect(dialog.getByRole("alert")).toContainText("0:00〜24:00");
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "未配置に戻す" }).click();
    await expect(page.getByTestId("unplaced-task").filter({ hasText: "B" })).toBeVisible();

    // 完了（タイムライン上のチェック）
    await block(page, "A").getByRole("button", { name: "完了にする" }).click();
    await expect(block(page, "A").getByRole("button", { name: "未完了に戻す" })).toBeVisible();

    // 配置済みタスクをパネルへドラッグして未配置へ戻す
    await scrollTimelineTo(page, 20 * 60);
    const a = await block(page, "A").boundingBox();
    const panel = await page.getByTestId("task-panel").boundingBox();
    await mouseDrag(page, { x: a!.x + 150, y: a!.y + 30 }, { x: panel!.x + 150, y: panel!.y + panel!.height - 80 });
    await expect(page.getByTestId("task-block")).toHaveCount(0);
    await expect(page.getByTestId("unplaced-task")).toHaveCount(2);

    // 削除
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Bを編集", exact: true }).click();
    await page.getByTestId("task-dialog").getByRole("button", { name: "削除" }).click();
    await expect(page.getByTestId("unplaced-task")).toHaveCount(1);
  });

  test("自動スクロール中でも、プレビューに出ていた時刻のまま保存される", async ({ page }) => {
    await freshStart(page);
    await addTask(page, "端", 30);
    await scrollTimelineTo(page, 12 * 60);
    const scroller = await page.getByTestId("timeline-scroll").boundingBox();
    const card = await page.getByTestId("unplaced-task").first().boundingBox();
    await page.mouse.move(card!.x + 40, card!.y + 20);
    await page.mouse.down();
    await page.mouse.move(card!.x + 50, card!.y + 30, { steps: 3 });
    // 表示領域の下端近くで止めて自動スクロールさせる
    await page.mouse.move(scroller!.x + 300, scroller!.y + scroller!.height - 8, { steps: 10 });
    await page.waitForTimeout(600);
    await page.mouse.move(scroller!.x + 301, scroller!.y + scroller!.height - 8);
    const preview = await page.getByTestId("drag-preview").getAttribute("data-start");
    await page.mouse.up();
    await expect(block(page, "端")).toHaveAttribute("data-start", preview!);
  });

  test("壊れた保存データでも画面が表示される", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-14T03:00:00Z"));
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("asu-no-sekkei:v1", "{broken"));
    await page.reload();
    await expect(page.getByTestId("timeline-body")).toBeVisible();
    await expect(page.getByRole("alert").first()).toContainText("読み込めなかった");
  });
});
