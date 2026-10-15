import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { block, freshStart, scrollTimelineTo, yOf } from "./helpers";

/** iPhone 14 サイズ：第1段階（目標管理の基盤） */

const now = "2026-10-14T00:00:00.000Z";
/** 現在公開中の形式（v2）の既存データ */
const V2 = {
  schemaVersion: 2,
  settings: { snapMinutes: 5, pxPerMinute: 1.5 },
  fixedEvents: [
    { id: "f1", title: "大学", weekdays: [1, 3, 4], startMin: 540, endMin: 720, color: "slate", validFrom: null, validTo: null, skipDates: ["2026-10-21"], createdAt: now, updatedAt: now },
  ],
  tasks: [
    { id: "t1", title: "レポート", durationMin: 60, color: "blue", done: false, date: "2026-10-15", startMin: 780, createdAt: now, updatedAt: now },
    { id: "t2", title: "買い物", durationMin: 15, color: "rose", done: false, date: null, startMin: null, createdAt: now, updatedAt: now },
  ],
};

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("asu-no-sekkei:v1")!));
const nav = (page: Page, label: string) => page.getByRole("navigation", { name: "メイン操作" }).getByRole("link", { name: label });

async function addGoal(page: Page, o: { title: string; status?: "やりたいこと" | "取り組み中"; deadline?: string; hours?: string; criteria?: string }) {
  await page.getByRole("button", { name: /＋ (目標|やりたいこと)を追加/ }).tap();
  const f = page.getByTestId("goal-form");
  await f.getByLabel("目標名").fill(o.title);
  if (o.status) await f.getByRole("radio", { name: o.status }).tap();
  if (o.criteria) await f.getByLabel("達成条件").fill(o.criteria);
  if (o.deadline) await f.getByLabel("達成期限（任意）").fill(o.deadline);
  if (o.hours) await f.getByLabel("想定必要時間（任意）（時間）").fill(o.hours);
  await f.getByRole("radio", { name: "高" }).tap();
  await f.getByRole("button", { name: "資格" }).tap();
  await f.getByRole("button", { name: /^(目標を追加|保存|工程は自分で作る（目標だけ追加）)$/ }).tap();
}

async function addStep(page: Page, title: string, hours: string, minutes: string, depends: string[] = []) {
  await page.getByRole("button", { name: "＋ 工程を追加" }).tap();
  const f = page.getByTestId("step-form");
  await f.getByLabel("工程名").fill(title);
  await f.getByLabel("必要時間（任意）（時間）").fill(hours);
  await f.getByLabel("必要時間（任意）（分）").fill(minutes);
  for (const d of depends) await f.getByRole("button", { name: d }).tap();
  await f.getByRole("button", { name: "工程を追加" }).tap();
  await expect(f).toHaveCount(0);
}

test("既存データを保ったまま、目標→工程→タスク→計画→完了→実績、達成は別に記録", async ({ page }) => {
  await freshStart(page, V2);

  // 既存の時間割はそのまま
  await expect(block(page, "レポート")).toHaveAttribute("data-start", "780");
  await expect(nav(page, "計画")).toHaveAttribute("aria-current", "page");

  // 目標画面へ
  await nav(page, "目標").tap();
  await expect(page.getByRole("heading", { name: "目標" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /取り組み中/ })).toHaveAttribute("aria-selected", "true");
  await addGoal(page, { title: "TOEIC 800点", deadline: "2026-12-20", hours: "100", criteria: "公式テストで800点以上" });

  // 詳細画面：工程を追加（2つ目は1つ目が前提）
  const detail = page.getByTestId("goal-detail");
  await expect(detail.getByRole("heading", { name: "TOEIC 800点" })).toBeVisible();
  await expect(detail).toContainText("期限 12月20日（日）（あと67日）");
  await addStep(page, "単語帳 Unit1", "0", "45");
  await addStep(page, "文法問題集", "2", "0", ["単語帳 Unit1"]);
  const rows = page.getByTestId("step-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("前提：「単語帳 Unit1」が未完了");
  await expect(page.getByTestId("goal-detail")).toContainText("残りの工程の必要時間（目安）：2時間45分");

  // 工程からタスクを作る → 計画を開く
  // 連打しても 1 件だけ作る
  const toTask = rows.nth(0).getByRole("button", { name: "単語帳 Unit1をタスクにする" });
  // 再描画の前に届く 2 回目のタップ（同じ瞬間の連続クリック）も無視する
  await toTask.evaluate((el: HTMLElement) => {
    el.click();
    el.click();
    el.click();
  });
  await expect(toTask).toHaveText("追加しました");
  await expect(toTask).toBeDisabled();
  await expect(rows.nth(0)).toHaveAttribute("data-step-status", "doing");
  await expect(rows.nth(0).getByTestId("step-tasks")).toContainText("タスク 1件");
  await page.getByTestId("toast").getByRole("button", { name: "計画を開く" }).tap();

  // 計画：未配置タスクに目標名付きで並ぶ。タップで配置（15:00）
  await page.getByRole("button", { name: /^タスク一覧/ }).tap();
  await page.waitForTimeout(350);
  const card = page.getByTestId("unplaced-task").filter({ hasText: "単語帳 Unit1" });
  await expect(card.getByTestId("task-goal")).toContainText("TOEIC 800点");
  await page.getByRole("button", { name: /単語帳 Unit1.*タップで配置先/ }).tap();
  await scrollTimelineTo(page, 15 * 60);
  await page.touchscreen.tap(250, (await yOf(page, 15 * 60)) + 1);
  await expect(block(page, "単語帳 Unit1")).toHaveAttribute("data-start", "900");

  // 完了 → 実績を記録し、工程も完了にするか尋ねる
  await page.getByTestId("selected-bar").getByRole("button", { name: "完了" }).tap();
  await expect(page.getByTestId("toast")).toContainText("作業時間を記録しました");
  await page.getByTestId("toast").getByRole("button", { name: "完了にする" }).tap();

  // 編集画面に目標・工程との対応を表示
  await page.getByTestId("selected-bar").getByRole("button", { name: "編集" }).tap();
  await expect(page.getByTestId("task-link")).toContainText("目標「TOEIC 800点」 ・ 工程「単語帳 Unit1」");
  await page.getByTestId("task-link").tap();

  // 目標詳細：工程が完了、実績 45分、達成はまだ
  await expect(page.getByTestId("goal-detail")).toBeVisible();
  await expect(rows.nth(0)).toHaveAttribute("data-step-status", "done");
  await expect(page.getByTestId("actual-minutes")).toHaveText("45分");
  await expect(page.getByTestId("goal-progress")).toContainText("1 / 2 完了");
  await expect(page.getByTestId("achievement")).toContainText("目標を達成した");
  await expect(rows.nth(1)).not.toContainText("前提：");

  // 手入力の実績
  await page.getByRole("button", { name: "＋ 作業時間を記録" }).tap();
  await page.getByTestId("worklog-form").getByLabel("作業時間（分）").fill("20");
  await page.getByTestId("worklog-form").getByRole("button", { name: "記録する" }).tap();
  await expect(page.getByTestId("actual-minutes")).toHaveText("1時間5分");

  // 達成（作業時間とは別）
  await page.getByRole("button", { name: "目標を達成した" }).tap();
  await expect(page.getByTestId("achievement")).toContainText("達成しました");
  let data = await stored(page);
  expect(data.schemaVersion).toBe(3);
  expect(data.goals[0].achievedAt).not.toBeNull();
  expect(data.workLogs.map((l: { minutes: number }) => l.minutes).sort()).toEqual([20, 45]);
  expect(data.goalSteps.map((s: { status: string }) => s.status)).toEqual(["done", "todo"]);
  const task = data.tasks.find((t: { title: string }) => t.title === "単語帳 Unit1");
  expect(task).toMatchObject({ goalId: data.goals[0].id, stepId: data.goalSteps[0].id, done: true, date: "2026-10-15", startMin: 900 });
  // 既存データは消えていない
  expect(data.tasks.find((t: { id: string }) => t.id === "t1")).toMatchObject({ title: "レポート", date: "2026-10-15", startMin: 780 });
  expect(data.fixedEvents[0]).toMatchObject({ id: "f1", skipDates: ["2026-10-21"] });
  expect(data.settings).toEqual({ snapMinutes: 5, pxPerMinute: 1.5 });
  // 移行前の元データを自動で退避
  const pre = await page.evaluate(() => localStorage.getItem("asu-no-sekkei:v1:backup:premigrate-v3"));
  expect(JSON.parse(pre!)).toMatchObject({ schemaVersion: 2, tasks: [{ id: "t1" }, { id: "t2" }] });

  // 一覧：達成済みタブへ
  await page.getByRole("button", { name: "目標一覧" }).tap();
  await expect(page.getByTestId("goal-card")).toHaveCount(0);
  await page.getByRole("tab", { name: /達成・終了/ }).tap();
  await expect(page.getByTestId("goal-card")).toContainText("TOEIC 800点");

  // 振り返り：実績の集計
  await nav(page, "振り返り").tap();
  // 直近7日（10/8〜10/14）の集計。明日（10/15）の予定として完了した45分は含まない
  await expect(page.getByTestId("week-minutes")).toHaveText("20分");

  // 再読み込み後も保持
  await page.reload();
  data = await stored(page);
  expect(data.goals).toHaveLength(1);
});

test("やりたいことリストと取り組み中の目標を区別する", async ({ page }) => {
  await freshStart(page, V2);
  await page.goto("/goals");
  await page.getByRole("tab", { name: /やりたいこと/ }).tap();
  await addGoal(page, { title: "海外で1か月暮らす" });
  await expect(page.getByTestId("goal-detail")).toContainText("やりたいこと");
  await page.getByRole("button", { name: "目標一覧" }).tap();
  await page.getByRole("tab", { name: /やりたいこと/ }).tap();
  await expect(page.getByTestId("goal-card")).toContainText("海外で1か月暮らす");
  await page.getByRole("tab", { name: /取り組み中/ }).tap();
  await expect(page.getByTestId("goal-card")).toHaveCount(0);

  await page.getByRole("tab", { name: /やりたいこと/ }).tap();
  await page.getByTestId("goal-card").tap();
  await page.getByRole("button", { name: "この目標に取り組む" }).tap();
  await page.getByRole("button", { name: "目標一覧" }).tap();
  await page.getByRole("tab", { name: /取り組み中/ }).tap();
  await expect(page.getByTestId("goal-card")).toContainText("海外で1か月暮らす");
});

test("バックアップの書き出しと復元（復元前のデータは自動退避）", async ({ page }) => {
  await freshStart(page, V2);
  await page.goto("/goals");
  await addGoal(page, { title: "簿記2級" });
  await addStep(page, "仕訳の復習", "3", "0");

  // 書き出し
  await page.goto("/settings");
  const section = page.getByTestId("backup-section");
  await expect(section).toContainText("タスク2件・固定予定1件・目標1件・工程1件");
  const [download] = await Promise.all([page.waitForEvent("download"), section.getByRole("button", { name: "バックアップを書き出す" }).tap()]);
  expect(download.suggestedFilename()).toMatch(/^asu-no-sekkei-backup-\d{8}-\d{4}\.json$/);
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path!, "utf8"));
  expect(backup).toMatchObject({ app: "asu-no-sekkei", schemaVersion: 3, data: { goals: [{ title: "簿記2級" }] } });

  // 目標を削除してから復元
  await page.goto("/goals");
  await page.getByTestId("goal-card").tap();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "この目標を削除" }).tap();
  await expect(page.getByTestId("goal-card")).toHaveCount(0);

  await page.goto("/settings");
  await page.getByTestId("restore-file").setInputFiles(path!);
  const confirm = page.getByTestId("restore-confirm");
  await expect(confirm).toContainText("目標0→1");
  await confirm.getByRole("button", { name: "復元する" }).tap();
  await expect(page.getByRole("status")).toContainText("バックアップから復元しました");
  let data = await stored(page);
  expect(data.goals.map((g: { title: string }) => g.title)).toEqual(["簿記2級"]);
  expect(data.goalSteps).toHaveLength(1);

  // 復元前の状態（目標0件）が自動退避されていて、そこへ戻すこともできる
  await section.getByRole("button", { name: "このブラウザ内の自動退避データを見る" }).tap();
  const locals = page.getByTestId("local-backups");
  const item = locals.getByRole("listitem").filter({ hasText: "復元する前のデータ（自動）" });
  await expect(item).toContainText("目標0");
  await expect(locals).toContainText("目標機能を追加する前のデータ（自動）");
  await item.getByRole("button", { name: "この時点に戻す" }).tap();
  await page.getByTestId("restore-confirm").getByRole("button", { name: "復元する" }).tap();
  data = await stored(page);
  expect(data.goals).toEqual([]);
  expect(data.tasks.map((t: { id: string }) => t.id)).toEqual(["t1", "t2"]);

  // 関係ないファイルは拒否
  await page.getByTestId("restore-file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"hello":1}') });
  await expect(section.getByRole("alert")).toContainText("「明日の設計」のバックアップではありません");
});

test("実行画面は今日の時間割、計画画面は明日から始まる", async ({ page }) => {
  await freshStart(page, V2);
  await expect(page.getByTestId("current-date")).toContainText("10月15日（木）");
  await nav(page, "実行").tap();
  await expect(page.getByTestId("current-date")).toContainText("10月14日（水）");
  await expect(nav(page, "実行")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("fixed-event")).toContainText("大学");
  await nav(page, "計画").tap();
  await expect(page.getByTestId("current-date")).toContainText("10月15日（木）");
});

test("同じ工程を別の日にも練習できる（時間をおけばもう一度タスクにでき、未配置が残っていれば確認する）", async ({ page }) => {
  await freshStart(page, V2);
  await page.goto("/goals");
  await addGoal(page, { title: "ギター" });
  await addStep(page, "Fコードの練習", "0", "30");
  const row = page.getByTestId("step-row").first();
  const toTask = row.getByRole("button", { name: "Fコードの練習をタスクにする" });
  await toTask.tap();
  await expect(row.getByTestId("step-tasks")).toContainText("タスク 1件");
  await expect(toTask).toHaveText("＋ タスクにして計画へ", { timeout: 3000 });

  // 未配置のタスクが残っている → 確認。キャンセルなら作らない
  page.once("dialog", (d) => {
    expect(d.message()).toContain("まだ配置していないタスクが1件あります");
    d.dismiss();
  });
  await toTask.tap();
  await page.waitForTimeout(300);
  await expect(row.getByTestId("step-tasks")).toContainText("タスク 1件");

  // 確認して作る（別の日の分）
  await expect(toTask).toHaveText("＋ タスクにして計画へ", { timeout: 3000 });
  page.once("dialog", (d) => d.accept());
  await toTask.tap();
  await expect(row.getByTestId("step-tasks")).toContainText("タスク 2件");
  const data = await stored(page);
  expect(data.tasks.filter((t: { title: string }) => t.title === "Fコードの練習")).toHaveLength(2);
  expect(data.tasks.filter((t: { id: string }) => t.id === "t1" || t.id === "t2")).toHaveLength(2);
});
