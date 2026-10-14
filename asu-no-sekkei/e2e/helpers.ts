import { expect, type Page } from "@playwright/test";

export const PX = 1.2;
/** 2026-10-14（水）12:00 JST。初期表示の「明日」は 10/15（木） */
export const NOW = new Date("2026-10-14T03:00:00Z");

export async function freshStart(page: Page, seed?: unknown) {
  await page.clock.setFixedTime(NOW);
  await page.goto("/");
  await page.evaluate((data) => {
    localStorage.clear();
    if (data) localStorage.setItem("asu-no-sekkei:v1", JSON.stringify(data));
  }, seed ?? null);
  await page.reload();
  await expect(page.getByTestId("timeline-body")).toBeVisible();
}

export async function addTask(page: Page, title: string, minutes: number) {
  await page.getByLabel("タスク名", { exact: true }).fill(title);
  await page.getByLabel("予定所要時間（分）").fill(String(minutes));
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByTestId("unplaced-task").filter({ hasText: title })).toBeVisible();
}

/** 指定した時刻がタイムラインの表示領域の中ほどに来るようにスクロールする（端の自動スクロールを避ける） */
export async function scrollTimelineTo(page: Page, minutes: number) {
  await page
    .getByTestId("timeline-scroll")
    .evaluate((el, y) => (el.scrollTop = Math.max(0, y - el.clientHeight * 0.45)), minutes * PX);
}

/** 0:00 線の画面上の Y 座標 */
export async function timelineTop(page: Page) {
  const box = await page.getByTestId("timeline-body").boundingBox();
  if (!box) throw new Error("timeline not visible");
  return box;
}

export async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 3, from.y + 3, { steps: 3 });
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.waitForTimeout(50);
  await page.mouse.up();
}

export function block(page: Page, title: string) {
  return page.getByTestId("task-block").filter({ hasText: title });
}
