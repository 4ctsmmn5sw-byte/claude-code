import { expect, test } from "@playwright/test";

test.describe("日付・曜日（Asia/Tokyo）", () => {
  test("端末が別のタイムゾーンでも東京基準で明日を表示する", async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: "America/Los_Angeles" });
    const page = await context.newPage();
    // LA では 10/14 08:30 だが、東京では 10/15（木）00:30
    await page.clock.setFixedTime(new Date("2026-10-14T15:30:00Z"));
    await page.goto("/");
    await expect(page.getByTestId("current-date")).toContainText("10月16日（金）");
    await expect(page.getByTestId("current-date")).toContainText("明日");
    await context.close();
  });

  test("東京で日付が変わると「今日」「明日」の基準が更新される", async ({ page }) => {
    // 10/14（水）23:59:00 JST
    await page.clock.install({ time: new Date("2026-10-14T14:59:00Z") });
    await page.goto("/");
    await expect(page.getByTestId("current-date")).toContainText("10月15日（木）");
    await expect(page.getByTestId("current-date")).toContainText("明日");
    // 0:00 を過ぎる
    await page.clock.runFor(90_000);
    await expect(page.getByTestId("current-date")).toContainText("10月15日（木）");
    await expect(page.getByTestId("current-date")).toContainText("今日");
    await page.getByRole("button", { name: "明日", exact: true }).click();
    await expect(page.getByTestId("current-date")).toContainText("10月16日（金）");
  });
});
