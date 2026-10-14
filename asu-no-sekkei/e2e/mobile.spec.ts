import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { block, freshStart, PX, scrollTimelineTo, timelineTop } from "./helpers";

type Pt = { x: number; y: number };

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", p?: Pt) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x: p!.x, y: p!.y, id: 1 }],
  });
}

/** 長押ししてからドラッグ */
async function longPressDrag(page: Page, cdp: CDPSession, from: Pt, to: Pt, holdMs = 400) {
  await touch(cdp, "touchStart", from);
  await page.waitForTimeout(holdMs);
  const steps = 15;
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, "touchMove", { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(60);
  await touch(cdp, "touchEnd");
}

test.describe("スマートフォン（タッチ操作）", () => {
  test("タイムライン優先表示・未配置タスクの開閉・長押しドラッグで配置・スワイプはスクロール・タッチで伸縮", async ({ page }) => {
    await freshStart(page);
    const cdp = await page.context().newCDPSession(page);
    const panel = page.getByTestId("task-panel");

    // 初期状態はパネルが閉じていてタイムラインが広く見える
    const closed = await panel.boundingBox();
    expect(closed!.height).toBeLessThanOrEqual(60);
    await page.getByRole("button", { name: /未配置タスク/ }).click();
    await expect(panel).toHaveAttribute("class", /max-h-\[62dvh\]/);

    await page.getByLabel("タスク名", { exact: true }).fill("散歩");
    await page.getByLabel("予定所要時間（分）").fill("30");
    await page.getByRole("button", { name: "追加", exact: true }).click();
    const card = page.getByTestId("unplaced-task").filter({ hasText: "散歩" });
    await expect(card).toBeVisible();

    // タイムラインの見えている範囲（パネルより上）に 7:40 が来るようにスクロール
    const scroller = await page.getByTestId("timeline-scroll").boundingBox();
    const panelBox = await panel.boundingBox();
    const visibleMid = scroller!.y + (panelBox!.y - scroller!.y) / 2;
    await page.getByTestId("timeline-scroll").evaluate((el, y) => (el.scrollTop = y), 7 * 60 * PX - (visibleMid - scroller!.y));
    const top = await timelineTop(page);
    const c = await card.boundingBox();
    await longPressDrag(page, cdp, { x: c!.x + 60, y: c!.y + c!.height / 2 }, { x: top.x + 120, y: top.y + (7 * 60 + 40) * PX + 12 });
    await expect(block(page, "散歩")).toHaveAttribute("data-start", String(7 * 60 + 40));

    // 素早いスワイプはドラッグにならず、タイムラインがスクロールする
    await page.getByRole("button", { name: /未配置タスク/ }).click(); // パネルを閉じる
    await scrollTimelineTo(page, 7 * 60 + 40);
    const before = await page.getByTestId("timeline-scroll").evaluate((el) => el.scrollTop);
    const b = await block(page, "散歩").boundingBox();
    await touch(cdp, "touchStart", { x: b!.x + 100, y: b!.y + 15 });
    for (let i = 1; i <= 8; i++) {
      await touch(cdp, "touchMove", { x: b!.x + 100, y: b!.y + 15 - i * 25 });
      await page.waitForTimeout(10);
    }
    await touch(cdp, "touchEnd");
    await page.waitForTimeout(400);
    const after = await page.getByTestId("timeline-scroll").evaluate((el) => el.scrollTop);
    expect(after).toBeGreaterThan(before + 50);
    await expect(block(page, "散歩")).toHaveAttribute("data-start", String(7 * 60 + 40));

    // 長押しで配置済みタスクを 30 分後ろへ移動
    await scrollTimelineTo(page, 8 * 60);
    const b2 = await block(page, "散歩").boundingBox();
    await longPressDrag(page, cdp, { x: b2!.x + 100, y: b2!.y + 15 }, { x: b2!.x + 100, y: b2!.y + 15 + 30 * PX });
    await expect(block(page, "散歩")).toHaveAttribute("data-start", String(8 * 60 + 10));

    // 下端ハンドルをタッチで伸ばす（8:10〜9:00）
    const top2 = await timelineTop(page);
    const h = await block(page, "散歩").getByTestId("resize-handle").boundingBox();
    const hp = { x: h!.x + h!.width / 2, y: h!.y + h!.height / 2 };
    await touch(cdp, "touchStart", hp);
    for (let i = 1; i <= 10; i++) {
      await touch(cdp, "touchMove", { x: hp.x, y: hp.y + ((top2.y + 9 * 60 * PX - hp.y) * i) / 10 });
      await page.waitForTimeout(16);
    }
    await touch(cdp, "touchEnd");
    await expect(block(page, "散歩")).toHaveAttribute("data-end", String(9 * 60));
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("asu-no-sekkei:v1")!).tasks[0])).toMatchObject({
      startMin: 8 * 60 + 10,
      durationMin: 50,
    });

    // タップで編集ダイアログが開く
    const b3 = await block(page, "散歩").boundingBox();
    await page.touchscreen.tap(b3!.x + 150, b3!.y + 20);
    await expect(page.getByTestId("task-dialog")).toBeVisible();
  });
});
