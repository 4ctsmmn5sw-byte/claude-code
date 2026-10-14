import { expect, test, type Page } from "@playwright/test";
import { SAMPLE } from "./fixtures";
import { block, freshStart, scrollTimelineTo, yOf } from "./helpers";

async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 3, from.y + 3, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.waitForTimeout(50);
  await page.mouse.up();
}

test.describe("PC（マウス）でも同じ縦型1カラム", () => {
  test("2カラムにならず中央に縦型時間割を表示、マウスのドラッグで正確に配置・移動", async ({ page }) => {
    await freshStart(page, SAMPLE);
    const vp = page.viewportSize()!;
    const tl = (await page.getByTestId("timeline-scroll").boundingBox())!;
    expect(tl.width).toBeLessThanOrEqual(520);
    expect(Math.abs(tl.x + tl.width / 2 - vp.width / 2)).toBeLessThan(2);

    await page.getByRole("button", { name: /^タスク一覧/ }).click();
    await page.waitForTimeout(350);
    await scrollTimelineTo(page, 15 * 60);
    const card = (await page.getByRole("button", { name: /英単語.*タップで配置先/ }).boundingBox())!;
    await mouseDrag(page, { x: card.x + 40, y: card.y + card.height / 2 }, { x: tl.x + 250, y: (await yOf(page, 15 * 60 + 35)) + 16 });
    await expect(block(page, "英単語")).toHaveAttribute("data-start", String(15 * 60 + 35));

    const b = (await block(page, "英単語").boundingBox())!;
    await mouseDrag(page, { x: b.x + 150, y: b.y + 20 }, { x: b.x + 150, y: b.y + 20 + 40 * 1.5 });
    await expect(block(page, "英単語")).toHaveAttribute("data-start", String(16 * 60 + 15));
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
