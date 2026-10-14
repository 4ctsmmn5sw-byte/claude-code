import { expect, type CDPSession, type Locator, type Page } from "@playwright/test";

/** 2026-10-14（水）12:00 JST。初期表示の「明日」は 10/15（木） */
export const NOW = new Date("2026-10-14T03:00:00Z");

export type Pt = { x: number; y: number };

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

/** 現在の表示倍率（1 分あたりの px） */
export async function ppm(page: Page): Promise<number> {
  return Number(await page.getByTestId("timeline-body").getAttribute("data-ppm"));
}

/** 0:00 線の画面上の位置 */
export async function timelineTop(page: Page) {
  const box = await page.getByTestId("timeline-body").boundingBox();
  if (!box) throw new Error("timeline not visible");
  return box;
}

/** 指定時刻が「シートより上の見えている範囲」の中ほどに来るようにスクロール */
export async function scrollTimelineTo(page: Page, minutes: number) {
  const p = await ppm(page);
  await page.getByTestId("timeline-scroll").evaluate(
    (el, { y }) => {
      const body = el.querySelector("[data-testid=timeline-body]") as HTMLElement;
      const offset = body.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
      el.scrollTop = Math.max(0, offset + y - (el.clientHeight - 64) * 0.45);
    },
    { y: minutes * p },
  );
}

/** ある時刻の画面上の Y 座標 */
export async function yOf(page: Page, minutes: number) {
  return (await timelineTop(page)).y + minutes * (await ppm(page));
}

export function block(page: Page, title: string): Locator {
  return page.getByTestId("task-block").filter({ hasText: title });
}

export async function storedTasks(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("asu-no-sekkei:v1")!).tasks);
}

/* ---------- タッチ操作（CDP で実際のタッチイベントを送る） ---------- */

export async function touchSession(page: Page) {
  return page.context().newCDPSession(page);
}

export async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", p?: Pt) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x: p!.x, y: p!.y, id: 1 }],
  });
}

export async function touchMoveTo(page: Page, cdp: CDPSession, from: Pt, to: Pt, steps = 15) {
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, "touchMove", { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
    await page.waitForTimeout(16);
  }
}

/** 長押ししてからドラッグして離す */
export async function longPressDrag(page: Page, cdp: CDPSession, from: Pt, to: Pt, opts: { holdMs?: number; beforeRelease?: () => Promise<void> } = {}) {
  await touch(cdp, "touchStart", from);
  await page.waitForTimeout(opts.holdMs ?? 420);
  await touchMoveTo(page, cdp, from, to);
  await page.waitForTimeout(80);
  await opts.beforeRelease?.();
  await touch(cdp, "touchEnd");
  await page.waitForTimeout(80);
}

/** 素早いスワイプ（長押しなし） */
export async function swipe(page: Page, cdp: CDPSession, from: Pt, dy: number) {
  await touch(cdp, "touchStart", from);
  for (let i = 1; i <= 8; i++) {
    await touch(cdp, "touchMove", { x: from.x, y: from.y + (dy * i) / 8 });
    await page.waitForTimeout(10);
  }
  await touch(cdp, "touchEnd");
  await page.waitForTimeout(300);
}

export async function tapAt(page: Page, p: Pt) {
  await page.touchscreen.tap(p.x, p.y);
}

export async function center(locator: Locator): Promise<Pt> {
  const b = await locator.boundingBox();
  if (!b) throw new Error("not visible");
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
