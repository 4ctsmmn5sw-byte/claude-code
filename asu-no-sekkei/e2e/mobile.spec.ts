import { expect, test, type Page } from "@playwright/test";
import { SAMPLE } from "./fixtures";
import {
  block,
  center,
  freshStart,
  longPressDrag,
  ppm,
  scrollTimelineTo,
  storedTasks,
  swipe,
  tapAt,
  touch,
  touchMoveTo,
  touchSession,
  yOf,
} from "./helpers";

/** iPhone 14（390×844）・タッチ操作での確認 */

const sheet = (page: Page) => page.getByTestId("task-sheet");
const scrollTop = (page: Page) => page.getByTestId("timeline-scroll").evaluate((el) => el.scrollTop);
const card = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`${title}.*タップで配置先`) });
const blockHit = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^${title} \\d`) });
const openTasks = async (page: Page) => {
  await page.getByRole("button", { name: /^タスク一覧/ }).click();
  await page.waitForTimeout(350); // シートが開くアニメーションの完了を待つ
};

test.describe("縦型時間割のレイアウト", () => {
  test("1カラム・固定ヘッダー／下部操作・初期表示は明日・主な予定が見える位置から", async ({ page }) => {
    await freshStart(page, SAMPLE);
    const vp = page.viewportSize()!;
    await expect(page.getByTestId("current-date")).toContainText("10月15日（木）");
    await expect(page.getByTestId("current-date")).toContainText("明日");

    // 横並びではなく、タイムラインとシートが画面幅いっぱい
    expect((await page.getByTestId("timeline-scroll").boundingBox())!.width).toBeCloseTo(vp.width, 0);
    expect((await sheet(page).boundingBox())!.width).toBeCloseTo(vp.width, 0);

    // 最初の予定（ジム 7:45）と大学（9:00〜）が最初から見えている
    await expect(block(page, "ジムで筋トレ")).toBeInViewport();
    await expect(page.getByTestId("fixed-event").first()).toBeInViewport();

    // タイムラインだけがスクロールし、ヘッダーと下部操作は動かない
    const header = page.locator("header");
    const nav = page.getByRole("navigation", { name: "メイン操作" });
    const before = { h: (await header.boundingBox())!.y, n: (await nav.boundingBox())!.y };
    await page.getByTestId("timeline-scroll").evaluate((el) => (el.scrollTop += 900));
    expect((await header.boundingBox())!.y).toBe(before.h);
    expect((await nav.boundingBox())!.y).toBe(before.n);
    const navBox = (await nav.boundingBox())!;
    expect(navBox.y + navBox.height).toBeCloseTo(vp.height, 0);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);

    // ホームインジケーター対策：viewport-fit=cover と safe-area の余白
    expect(await page.locator('meta[name="viewport"]').getAttribute("content")).toContain("viewport-fit=cover");
    expect(await nav.getAttribute("class")).toContain("env(safe-area-inset-bottom)");
  });

  test("主要な操作は 44px 以上（小さい予定も当たり判定を確保）", async ({ page }) => {
    await freshStart(page, SAMPLE);
    await scrollTimelineTo(page, 12 * 60 + 20);
    const targets = page.locator("header button, header a, nav a, [data-testid=task-sheet] button, [data-testid=timeline-body] [role=button], [data-testid=fixed-event] button");
    const n = await targets.count();
    expect(n).toBeGreaterThan(8);
    for (let i = 0; i < n; i++) {
      const b = await targets.nth(i).boundingBox();
      if (!b) continue;
      expect.soft(Math.min(b.width, b.height), await targets.nth(i).evaluate((el) => el.outerHTML.slice(0, 90))).toBeGreaterThanOrEqual(44);
    }
    // 10 分（15px）のタスクも、見た目の少し下をタップして選択できる
    const mail = (await block(page, "メール返信").boundingBox())!;
    expect(mail.height).toBeLessThan(20);
    await tapAt(page, { x: mail.x + 120, y: mail.y + mail.height + 10 });
    await expect(block(page, "メール返信")).toHaveAttribute("data-selected", "true");
  });
});

test.describe("タッチでのドラッグ＆ドロップ", () => {
  test("長押しでドラッグ開始・一覧が縮小・開始/終了時刻を常に表示・離した時刻に配置", async ({ page }) => {
    await freshStart(page, SAMPLE);
    const cdp = await touchSession(page);
    await openTasks(page);
    await expect(sheet(page)).toHaveAttribute("data-mode", "open");
    await scrollTimelineTo(page, 15 * 60);
    const from = await center(card(page, "英単語"));
    // 未配置からのドラッグでは指がタスク上端から 16px 下に来る
    const to = { x: 220, y: (await yOf(page, 15 * 60 + 20)) + 16 };
    await longPressDrag(page, cdp, from, to, {
      beforeRelease: async () => {
        await expect(sheet(page)).toHaveAttribute("data-mode", "peek");
        await expect(page.getByTestId("drag-hint")).toHaveText("15:20 – 15:50（30分）");
        await expect(page.getByTestId("drag-preview")).toHaveAttribute("data-start", "920");
      },
    });
    await expect(block(page, "英単語")).toHaveAttribute("data-start", "920");
    await expect(block(page, "英単語")).toHaveAttribute("data-end", "950");
    await expect(page.getByTestId("selected-bar")).toContainText("15:20–15:50");
    await expect(page.getByTestId("drag-hint")).toHaveCount(0);

    // 再読み込み後も残る
    await page.reload();
    await expect(block(page, "英単語")).toHaveAttribute("data-start", "920");
  });

  test("通常のスワイプ・短い押下からの移動はスクロールになり、ドラッグしない", async ({ page }) => {
    await freshStart(page, SAMPLE);
    const cdp = await touchSession(page);
    await scrollTimelineTo(page, 13 * 60 + 30);
    const p = await center(blockHit(page, "レポートの構成を考える"));

    const s0 = await scrollTop(page);
    await swipe(page, cdp, p, -220);
    const s1 = await scrollTop(page);
    expect(s1).toBeGreaterThan(s0 + 100);
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-start", "780");

    // 150ms 押してから動かす（300ms 未満）→ スクロール
    await scrollTimelineTo(page, 13 * 60 + 30);
    const s2 = await scrollTop(page);
    const p2 = await center(blockHit(page, "レポートの構成を考える"));
    await touch(cdp, "touchStart", p2);
    await page.waitForTimeout(150);
    await touchMoveTo(page, cdp, p2, { x: p2.x, y: p2.y + 160 }, 8);
    await expect(page.getByTestId("drag-hint")).toHaveCount(0);
    await touch(cdp, "touchEnd");
    await page.waitForTimeout(300);
    expect(await scrollTop(page)).toBeLessThan(s2 - 60);
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-start", "780");
  });

  test("重なる位置は赤く表示して配置しない（勝手にずらさず、元の位置・状態に戻す）", async ({ page }) => {
    await freshStart(page, SAMPLE);
    const cdp = await touchSession(page);
    await openTasks(page);
    await scrollTimelineTo(page, 10 * 60);
    await longPressDrag(page, cdp, await center(card(page, "英単語")), { x: 220, y: (await yOf(page, 10 * 60)) + 16 }, {
      beforeRelease: async () => {
        await expect(page.getByTestId("drag-preview")).toHaveAttribute("data-valid", "false");
        await expect(page.getByTestId("drag-hint")).toContainText("重なるため配置できません");
      },
    });
    await expect(page.getByTestId("toast")).toContainText("大学");
    await expect(block(page, "英単語")).toHaveCount(0);
    await expect(sheet(page)).toHaveAttribute("data-mode", "open"); // 一覧も元の状態に戻る
    expect((await storedTasks(page)).find((t: { id: string }) => t.id === "t4").startMin).toBeNull();

    // 配置済みタスクを他のタスクに重ねても動かない
    await page.getByRole("button", { name: /^タスク一覧/ }).click(); // シートを下げる
    await scrollTimelineTo(page, 12 * 60 + 30);
    const r = (await block(page, "レポートの構成を考える").boundingBox())!;
    const grab = { x: r.x + 150, y: r.y + 20 };
    await longPressDrag(page, cdp, grab, { x: grab.x, y: grab.y - 50 * (await ppm(page)) });
    await expect(page.getByTestId("toast")).toContainText("メール返信");
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-start", "780");
    await expect(block(page, "メール返信")).toHaveAttribute("data-start", "735");
  });

  test("タイムライン外で離す・タッチがキャンセルされたら元の位置に戻る", async ({ page }) => {
    await freshStart(page, SAMPLE);
    const cdp = await touchSession(page);
    await scrollTimelineTo(page, 13 * 60 + 30);
    const r = (await block(page, "レポートの構成を考える").boundingBox())!;
    const grab = { x: r.x + 150, y: r.y + 30 };

    // ヘッダーの上で離す
    await longPressDrag(page, cdp, grab, { x: 200, y: 40 }, {
      beforeRelease: async () => expect(page.getByTestId("drag-hint")).toContainText("キャンセル"),
    });
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-start", "780");

    // 途中でタッチがキャンセルされた（着信など）
    await scrollTimelineTo(page, 13 * 60 + 30);
    const r2 = (await block(page, "レポートの構成を考える").boundingBox())!;
    const g2 = { x: r2.x + 150, y: r2.y + 30 };
    await touch(cdp, "touchStart", g2);
    await page.waitForTimeout(420);
    await touchMoveTo(page, cdp, g2, { x: g2.x, y: g2.y + 120 });
    await expect(page.getByTestId("drag-preview")).toBeVisible();
    await touch(cdp, "touchCancel");
    await page.waitForTimeout(150);
    await expect(page.getByTestId("drag-preview")).toHaveCount(0);
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-start", "780");
  });

  test("画面の上下端に近づくと自動スクロールし、表示中の時刻のまま保存される", async ({ page }) => {
    // 夕方以降を空けておく（アルバイトなし）
    await freshStart(page, { ...SAMPLE, fixedEvents: [SAMPLE.fixedEvents[0]] });
    const cdp = await touchSession(page);
    await scrollTimelineTo(page, 13 * 60 + 30);
    const r = (await block(page, "レポートの構成を考える").boundingBox())!;
    const grab = { x: r.x + 150, y: r.y + 20 };
    const sheetTop = (await sheet(page).boundingBox())!.y;
    const s0 = await scrollTop(page);
    let shown = "";
    await longPressDrag(page, cdp, grab, { x: grab.x, y: sheetTop - 12 }, {
      beforeRelease: async () => {
        await page.waitForTimeout(700);
        expect(await scrollTop(page)).toBeGreaterThan(s0 + 150);
        // 中ほどへ戻すと自動スクロールが止まる。そのとき表示中の時刻で保存されることを確認
        await touchMoveTo(page, cdp, { x: grab.x, y: sheetTop - 12 }, { x: grab.x, y: sheetTop - 250 }, 6);
        await page.waitForTimeout(150);
        shown = (await page.getByTestId("drag-preview").getAttribute("data-start"))!;
      },
    });
    expect(await page.getByTestId("drag-preview").count()).toBe(0);
    expect(Number(shown)).toBeGreaterThan(14 * 60);
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-start", shown);

    // 上端
    const top = (await page.getByTestId("timeline-scroll").boundingBox())!.y;
    const b = (await block(page, "レポートの構成を考える").boundingBox())!;
    const s1 = await scrollTop(page);
    await longPressDrag(page, cdp, { x: b.x + 150, y: b.y + 20 }, { x: b.x + 150, y: top + 10 }, {
      beforeRelease: async () => {
        await page.waitForTimeout(500);
        expect(await scrollTop(page)).toBeLessThan(s1 - 100);
      },
    });
  });
});

test.describe("タップで配置（代替操作）", () => {
  test("未配置タスクをタップ → 空き時間をタップで配置。重なる場所は赤く示して配置しない", async ({ page }) => {
    await freshStart(page, SAMPLE);
    await openTasks(page);
    await card(page, "英単語").tap();
    await expect(page.getByTestId("placing-bar")).toContainText("英単語");
    await expect(sheet(page)).toHaveAttribute("data-mode", "peek");

    // 15:07 付近をタップ → 5 分刻みで切り捨てて 15:05 から
    await scrollTimelineTo(page, 15 * 60);
    await tapAt(page, { x: 250, y: (await yOf(page, 15 * 60 + 7)) + 0.5 });
    await expect(block(page, "英単語")).toHaveAttribute("data-start", "905");
    await expect(page.getByTestId("toast")).toContainText("15:05–15:35");
    await expect(page.getByTestId("placing-bar")).toHaveCount(0);

    // 固定予定の上をタップ → 赤く表示・配置しない・選択は続く
    // （配置したタスクが選択中なので、選択を閉じてから一覧を開く）
    await page.getByTestId("selected-bar").getByRole("button", { name: "閉じる" }).tap();
    await openTasks(page);
    await card(page, "買い物").tap();
    await scrollTimelineTo(page, 10 * 60);
    await tapAt(page, { x: 250, y: await yOf(page, 10 * 60 + 30) });
    await expect(page.getByTestId("drag-preview")).toHaveAttribute("data-valid", "false");
    await expect(page.getByTestId("toast")).toContainText("大学");
    await expect(block(page, "買い物")).toHaveCount(0);
    await expect(page.getByTestId("placing-bar")).toBeVisible();
    await page.getByTestId("placing-bar").getByRole("button", { name: "キャンセル" }).tap();
    await expect(page.getByTestId("placing-bar")).toHaveCount(0);
  });
});

test.describe("時間調整", () => {
  test("選択したタスクだけに下端ハンドル。タッチで伸縮、重なると赤く表示して元に戻す", async ({ page }) => {
    await freshStart(page, SAMPLE);
    const cdp = await touchSession(page);
    await scrollTimelineTo(page, 14 * 60);
    await expect(page.getByTestId("resize-handle")).toHaveCount(0);
    await blockHit(page, "レポートの構成を考える").tap();
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-selected", "true");
    const handle = page.getByTestId("resize-handle");
    await expect(handle).toHaveCount(1);
    expect((await handle.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // 14:40 まで伸ばす
    const h = await center(handle);
    await touch(cdp, "touchStart", h);
    await touchMoveTo(page, cdp, h, { x: h.x, y: await yOf(page, 14 * 60 + 41) }, 10);
    await expect(page.getByTestId("resize-label")).toContainText("13:00–14:40（100分）");
    await touch(cdp, "touchEnd");
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-end", "880");
    expect((await storedTasks(page)).find((t: { id: string }) => t.id === "t1").durationMin).toBe(100);

    // アルバイト（18:00〜）に重なるまで伸ばすと赤く表示し、離しても元の長さのまま
    await scrollTimelineTo(page, 16 * 60);
    const h2 = await center(handle);
    await touch(cdp, "touchStart", h2);
    await touchMoveTo(page, cdp, h2, { x: h2.x, y: await yOf(page, 18 * 60 + 20) }, 12);
    await expect(page.getByTestId("resize-label")).toContainText("重複");
    await touch(cdp, "touchEnd");
    await expect(page.getByTestId("toast")).toContainText("アルバイト");
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-end", "880");
  });

  test("タップした編集画面で開始・終了・所要時間を 1 分単位で入力", async ({ page }) => {
    await freshStart(page, SAMPLE);
    await scrollTimelineTo(page, 13 * 60 + 30);
    await blockHit(page, "レポートの構成を考える").tap();
    await blockHit(page, "レポートの構成を考える").tap(); // 選択中をもう一度タップで編集
    const dialog = page.getByTestId("task-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("開始").fill("15:07");
    await dialog.getByLabel("所要（分）").fill("23");
    await expect(dialog.getByLabel("終了")).toHaveValue("15:30");
    await dialog.getByRole("button", { name: "保存" }).tap();
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-start", "907");
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-end", "930");

    await page.getByTestId("selected-bar").getByRole("button", { name: "編集" }).tap();
    await dialog.getByLabel("終了").fill("16:01");
    await expect(dialog.getByLabel("所要（分）")).toHaveValue("54");
    await dialog.getByRole("button", { name: "保存" }).tap();
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-end", "961");
  });

  test("表示倍率を変えても画面中央の時刻が保たれ、拡大時も 1 分刻みで正確に配置できる", async ({ page }) => {
    await freshStart(page, { ...SAMPLE, settings: { snapMinutes: 1, pxPerMinute: 1.5 } });
    const cdp = await touchSession(page);
    await scrollTimelineTo(page, 14 * 60);
    const centerMinute = () =>
      page.getByTestId("timeline-scroll").evaluate((el) => {
        const body = el.querySelector("[data-testid=timeline-body]") as HTMLElement;
        const offset = body.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
        return (el.scrollTop + (el.clientHeight - 64) / 2 - offset) / Number(body.dataset.ppm);
      });
    const c0 = await centerMinute();
    await page.getByRole("button", { name: "拡大" }).tap();
    await expect(page.getByTestId("zoom-label")).toHaveText("133%");
    expect(Math.abs((await centerMinute()) - c0)).toBeLessThan(1);
    await page.getByRole("button", { name: "拡大" }).tap();
    await expect(page.getByTestId("zoom-label")).toHaveText("200%");
    expect(Math.abs((await centerMinute()) - c0)).toBeLessThan(1);
    expect(await ppm(page)).toBe(3);

    // 200% でレポート（13:00）を 37 分後ろへ
    await scrollTimelineTo(page, 13 * 60 + 20);
    const r = (await block(page, "レポートの構成を考える").boundingBox())!;
    const grab = { x: r.x + 150, y: r.y + 50 };
    await longPressDrag(page, cdp, grab, { x: grab.x, y: grab.y + 37 * 3 });
    await expect(block(page, "レポートの構成を考える")).toHaveAttribute("data-start", String(13 * 60 + 37));

    // 縮小して戻しても位置と時刻の対応は同じ
    await page.getByRole("button", { name: "縮小" }).tap();
    await page.getByRole("button", { name: "縮小" }).tap();
    await page.getByRole("button", { name: "縮小" }).tap();
    expect(await ppm(page)).toBe(1);
    const b = (await block(page, "レポートの構成を考える").boundingBox())!;
    expect(b.y).toBeCloseTo(await yOf(page, 13 * 60 + 37), 0);
    expect(b.height).toBeCloseTo(60, 0);
  });
});

test.describe("曜日別の固定予定", () => {
  test("曜日・時刻・適用期間を設定し、この日だけ休み／毎週の予定の編集ができる", async ({ page }) => {
    await freshStart(page);
    const cdp = await touchSession(page);
    await page.getByRole("link", { name: "固定予定・設定" }).tap();
    await page.getByRole("button", { name: "＋ 固定予定を追加" }).tap();
    const form = page.getByTestId("fixed-form");
    await form.getByLabel("予定名").fill("大学");
    await form.getByRole("button", { name: "月", exact: true }).tap();
    await form.getByRole("button", { name: "水", exact: true }).tap();
    await form.getByLabel("開始時刻").fill("9:00");
    await form.getByLabel("終了時刻").fill("12:00");
    await form.getByLabel("適用開始日").fill("2026-10-19");
    await form.getByLabel("適用終了日").fill("2026-11-30");
    await form.getByRole("button", { name: "登録" }).tap();
    await expect(page.getByTestId("fixed-list")).toContainText("月・水");
    await expect(page.getByTestId("fixed-list")).toContainText("期間 10月19日〜11月30日");
    await page.getByRole("link", { name: "タイムラインへ" }).tap();

    const next = () => page.getByRole("button", { name: "次の日" }).tap();
    // 10/14（水）は適用開始前なので出ない
    await page.getByRole("button", { name: "今日", exact: true }).tap();
    await expect(page.getByTestId("fixed-event")).toHaveCount(0);
    for (let i = 0; i < 5; i++) await next();
    await expect(page.getByTestId("current-date")).toContainText("10月19日（月）");
    await expect(page.getByTestId("fixed-event")).toHaveCount(1);
    await next();
    await expect(page.getByTestId("fixed-event")).toHaveCount(0); // 火
    await next();
    await expect(page.getByTestId("current-date")).toContainText("10月21日（水）");
    const fixed = page.getByTestId("fixed-event");
    await expect(fixed).toHaveCount(1);
    await expect(fixed).toContainText("大学");

    // 長押ししても動かない
    await scrollTimelineTo(page, 10 * 60);
    const f = await center(fixed);
    await longPressDrag(page, cdp, f, { x: f.x, y: f.y + 200 });
    await expect(fixed).toHaveAttribute("data-start", "540");
    await expect(page.getByTestId("fixed-sheet")).toHaveCount(0);

    // タップ → この日だけ休み
    await fixed.getByRole("button").tap();
    await expect(page.getByTestId("fixed-sheet")).toBeVisible();
    await page.getByRole("button", { name: /この日だけ休みにする/ }).tap();
    await expect(page.getByTestId("fixed-event")).toHaveCount(0);
    await expect(page.getByTestId("skipped-fixed-event")).toHaveCount(1);
    // 次の週の水曜は通常どおり表示（繰り返し全体には影響しない）
    for (let i = 0; i < 7; i++) await next();
    await expect(page.getByTestId("current-date")).toContainText("10月28日（水）");
    await expect(page.getByTestId("fixed-event")).toHaveCount(1);
    for (let i = 0; i < 7; i++) await page.getByRole("button", { name: "前の日" }).tap();
    await page.getByTestId("skipped-fixed-event").tap();
    await page.getByRole("button", { name: /休みを取り消す/ }).tap();
    await expect(page.getByTestId("fixed-event")).toHaveCount(1);

    // 毎週の予定を編集 → 設定画面でその予定の編集が開く
    await page.getByTestId("fixed-event").getByRole("button").tap();
    await page.getByRole("button", { name: /毎週の予定を編集する/ }).tap();
    await expect(page.getByTestId("fixed-form")).toBeVisible();
    await expect(page.getByTestId("fixed-form").getByLabel("予定名")).toHaveValue("大学");
    await page.getByTestId("fixed-form").getByLabel("終了時刻").fill("13:00");
    await page.getByTestId("fixed-form").getByRole("button", { name: "更新" }).tap();
    await page.getByRole("link", { name: "タイムラインへ" }).tap();
    // 表示していた日付に戻り、変更が反映されている
    await expect(page.getByTestId("current-date")).toContainText("10月21日（水）");
    await expect(page.getByTestId("fixed-event")).toHaveAttribute("data-end", "780");
  });
});
