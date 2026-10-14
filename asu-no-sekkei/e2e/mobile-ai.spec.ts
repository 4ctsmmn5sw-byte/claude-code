import { expect, test, type Page } from "@playwright/test";
import { SAMPLE } from "./fixtures";
import { block, freshStart } from "./helpers";

/**
 * iPhone 14 サイズ：第2段階（AI による目標の分解）。
 * テスト用サーバーは GEMINI_API_KEY なしで動くので、AI は「仮データ」で応答する（キー不要・費用なし）。
 * サーバーの1日の上限（10回）を使い切らないよう、実際にサーバーを呼ぶのは最初と最後のテストだけ。
 */

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("asu-no-sekkei:v1")!));
const sheet = (page: Page) => page.getByTestId("ai-plan-sheet");

async function openAiFromGoalForm(page: Page, o: { title: string; criteria?: string; deadline?: string }) {
  await page.goto("/goals");
  await page.getByRole("button", { name: /＋ (目標|やりたいこと)を追加/ }).tap();
  const f = page.getByTestId("goal-form");
  await f.getByLabel("目標名").fill(o.title);
  if (o.criteria) await f.getByLabel("達成条件").fill(o.criteria);
  if (o.deadline) await f.getByLabel("達成期限（任意）").fill(o.deadline);
  await f.getByRole("button", { name: "✨ AIに計画を作ってもらう" }).tap();
  await expect(sheet(page)).toBeVisible();
  await page.waitForTimeout(350);
  await expect(sheet(page).getByTestId("ai-mode")).toContainText("仮データ（API キー未設定）");
}

test("目標を入力 → AI の質問に回答 → 提案を編集 → 承認して保存 → 明日の時間割に追加", async ({ page }) => {
  await freshStart(page, SAMPLE);
  await openAiFromGoalForm(page, { title: "TOEIC 800点", deadline: "2026-12-20" });
  const s = sheet(page);

  // 目標入力画面の内容を引き継ぐ
  await expect(s.getByLabel("目標名")).toHaveValue("TOEIC 800点");
  await s.getByLabel("1週間に使える時間（任意）（時間）").fill("3");
  await s.getByRole("button", { name: /AIに相談する/ }).tap();

  // 足りない情報（現状・達成条件）を質問してくる
  const q = s.getByTestId("ai-questions");
  await expect(q).toContainText("今の進み具合を教えてください");
  await expect(q).toContainText("何ができたら達成としますか？");
  await q.getByRole("button", { name: "少し始めている" }).tap();
  await q.getByLabel("何ができたら達成としますか？").fill("公式テストで800点");
  await q.getByRole("button", { name: /回答して計画を作る/ }).tap();

  // 提案：推定値であること、AI の見立て、アプリの計算
  const draft = s.getByTestId("ai-draft");
  await expect(draft).toBeVisible();
  await expect(draft).toContainText("必要時間は AI による推定値です");
  await expect(draft.getByTestId("ai-feasibility")).toContainText("AI の見立て：期限までにぎりぎり");
  const capacity = draft.getByTestId("capacity-check");
  // 10/14〜12/20 の 68日 × 週3時間 ÷ 7 = 29時間8分、合計 30+45+600+600+180 = 24時間15分（8割超 → ぎりぎり）
  await expect(capacity).toContainText("必要時間の合計（推定）：24時間15分");
  await expect(capacity).toContainText("期限までに使える時間：29時間8分");
  await expect(capacity).toContainText("余裕はあまりありません");
  const steps = draft.getByTestId("ai-step");
  await expect(steps).toHaveCount(5);
  await expect(steps.nth(0)).toContainText("AI推定");

  // 自由に編集：名前・時間・優先度・削除・追加
  await draft.getByLabel("工程1の名前").fill("現状を整理する");
  await draft.getByLabel("工程1の必要時間（分）").fill("40");
  await expect(steps.nth(0)).not.toContainText("AI推定");
  await draft.getByRole("radiogroup", { name: "工程2の優先度" }).getByRole("radio", { name: "低" }).tap();
  await draft.getByRole("button", { name: "工程4を削除" }).tap();
  await expect(steps).toHaveCount(4);
  await draft.getByRole("button", { name: "＋ 工程を追加" }).tap();
  await draft.getByLabel("工程5の名前").fill("単語アプリを入れる");
  await expect(capacity).toContainText("必要時間の合計（推定）：14時間55分");
  await expect(capacity).toContainText("期限までの時間に収まります");

  // 保存前は何も保存されていない
  expect((await stored(page)).goals ?? []).toHaveLength(0);
  await draft.getByRole("button", { name: "この内容で保存する（5工程）" }).tap();
  await expect(s.getByTestId("ai-saved")).toContainText("5つの工程を目標に保存しました");

  const data = await stored(page);
  expect(data.goals).toHaveLength(1);
  expect(data.goals[0]).toMatchObject({ title: "TOEIC 800点", deadline: "2026-12-20" });
  const saved = [...data.goalSteps].sort((a: { order: number }, b: { order: number }) => a.order - b.order);
  expect(saved.map((x: { title: string; estimatedMinutes: number; priority: string; aiEstimated: boolean }) => [x.title, x.estimatedMinutes, x.priority, x.aiEstimated])).toEqual([
    ["現状を整理する", 40, "high", false],
    ["必要な教材・道具をそろえる", 45, "low", true],
    ["基礎の練習（前半）", 600, "high", true],
    ["本番形式で力を確かめる", 180, "medium", true],
    ["単語アプリを入れる", 30, "medium", false],
  ]);
  // 削除した工程（後半）を前提にしていた「本番形式」は、その前提（前半）を引き継ぐ
  expect(saved[3].dependsOn).toEqual([saved[2].id]);
  expect(saved[1].dependsOn).toEqual([saved[0].id]);

  // 明日の時間割に追加：前提が済んでいる工程が最初から選ばれている
  const picker = s.getByTestId("tomorrow-picker");
  await expect(picker.getByRole("button", { name: "現状を整理するを明日に追加" })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.getByRole("button", { name: "単語アプリを入れるを明日に追加" })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.getByRole("button", { name: "必要な教材・道具をそろえるを明日に追加" })).toHaveAttribute("aria-pressed", "false");
  await picker.getByRole("button", { name: "明日の時間割に追加（2件）" }).tap();

  // 10/15（木）：大学 9:00-12:00・配置済み 7:45-8:30 / 12:15-12:25 / 13:00-14:00 を避けて最も早い空き
  const result = s.getByTestId("tomorrow-result");
  await expect(result).toContainText("現状を整理する14:00–14:40");
  await expect(result).toContainText("単語アプリを入れる08:30–09:00");

  const after = await stored(page);
  const t = (title: string) => after.tasks.find((x: { title: string }) => x.title === title);
  expect(t("現状を整理する")).toMatchObject({ date: "2026-10-15", startMin: 840, durationMin: 40, goalId: after.goals[0].id });
  expect(t("単語アプリを入れる")).toMatchObject({ date: "2026-10-15", startMin: 510, durationMin: 30 });
  // 既存のタスク・固定予定はそのまま
  expect(t("レポートの構成を考える")).toMatchObject({ date: "2026-10-15", startMin: 780, durationMin: 60 });
  expect(after.tasks).toHaveLength(SAMPLE.tasks.length + 2);
  expect(after.fixedEvents.map((e: { id: string }) => e.id)).toEqual(["f1", "f2"]);

  await result.getByRole("link", { name: "明日の計画を開く" }).tap();
  await expect(block(page, "現状を整理する")).toHaveAttribute("data-start", "840");
  await expect(block(page, "単語アプリを入れる")).toHaveAttribute("data-start", "510");
});

test("既存の目標に工程を提案してもらう／上限・無料枠超過のときは止まる", async ({ page }) => {
  // この テストはサーバーを呼ばず、応答を差し替える
  let mode: "plan" | "daily" | "quota" = "plan";
  await page.route("**/api/ai/session", (route) =>
    route.fulfill({ json: { mock: false, model: "gemini-2.5-flash", authRequired: false, authenticated: true, misconfigured: null, usage: { used: 3, limit: 10 } } }),
  );
  let calls = 0;
  let lastBody: Record<string, unknown> = {};
  await page.route("**/api/ai/plan", async (route) => {
    calls++;
    lastBody = route.request().postDataJSON();
    if (mode === "daily") {
      return route.fulfill({ status: 429, json: { ok: false, code: "daily_limit", message: "今日の AI の利用上限（10回）に達しました", usage: { used: 10, limit: 10 } } });
    }
    if (mode === "quota") {
      return route.fulfill({ status: 429, json: { ok: false, code: "quota_exceeded", message: "Gemini API の無料枠の上限に達したため停止しました。有料の API には切り替えません", usage: { used: 4, limit: 10 } } });
    }
    return route.fulfill({
      json: {
        ok: true,
        mock: false,
        model: "gemini-2.5-flash",
        usage: { used: 4, limit: 10 },
        data: {
          ready: true,
          questions: [],
          plan: {
            summary: "残りを2つに分けました",
            approach: "",
            feasibility: { status: "unlikely", reason: "週1時間では12月20日までに必要な時間が足りません" },
            steps: [
              { key: "a", title: "Part5 を毎日10問", detail: "", estimatedMinutes: 600, priority: "high", dependsOn: [] },
              { key: "b", title: "模試を1回解く", detail: "", estimatedMinutes: 120, priority: "medium", dependsOn: ["a"] },
            ],
          },
        },
      },
    });
  });

  await freshStart(page, {
    ...SAMPLE,
    schemaVersion: 3,
    goals: [{ id: "g1", title: "TOEIC 800点", description: "", successCriteria: "800点", deadline: "2026-12-20", priority: "high", estimatedMinutes: null, category: "資格", status: "active", achievedAt: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }],
    goalSteps: [{ id: "s1", goalId: "g1", title: "単語帳", note: "", estimatedMinutes: 60, status: "done", order: 0, dependsOn: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }],
    workLogs: [{ id: "w1", goalId: "g1", stepId: "s1", taskId: null, date: "2026-10-10", minutes: 60, note: "", createdAt: "2026-10-10T00:00:00.000Z" }],
  });
  await page.goto("/goals?id=g1");
  await page.getByRole("button", { name: "✨ AIに工程を提案してもらう" }).tap();
  const s = sheet(page);
  await page.waitForTimeout(350);
  await expect(s.getByTestId("ai-mode")).toContainText("Gemini（gemini-2.5-flash・無料枠）");
  await expect(s).toContainText("登録済みの工程 1件と重ならないよう提案します");

  // 上限に達しているときはエラーを出して止まる
  mode = "daily";
  await s.getByLabel("1週間に使える時間（任意）（時間）").fill("1");
  await s.getByRole("button", { name: /AIに相談する/ }).tap();
  await expect(s.getByTestId("ai-error")).toContainText("今日の AI の利用上限（10回）に達しました");
  await expect(s.getByRole("button", { name: /AIに相談する/ })).toBeDisabled();
  expect(calls).toBe(1);
  // AI に送るのは目標の内容と既存の工程名だけ（時間割・予定・作業記録は送らない）
  expect(Object.keys(lastBody).sort()).toEqual(["answers", "existingSteps", "final", "goal", "situation", "today", "weeklyMinutes"]);
  expect(lastBody.existingSteps).toEqual(["単語帳"]);
  expect(JSON.stringify(lastBody)).not.toMatch(/大学|アルバイト|レポート/);

  // 開き直す → 無料枠超過も同じく止まる（自動で再試行しない）
  await s.getByRole("button", { name: "閉じる" }).first().tap();
  await page.waitForTimeout(350);
  mode = "quota";
  await page.getByRole("button", { name: "✨ AIに工程を提案してもらう" }).tap();
  await page.waitForTimeout(350);
  await s.getByLabel("1週間に使える時間（任意）（時間）").fill("1");
  await s.getByRole("button", { name: /AIに相談する/ }).tap();
  await expect(s.getByTestId("ai-error")).toContainText("有料の API には切り替えません");
  await page.waitForTimeout(500);
  expect(calls).toBe(2);

  // 成功：期限に間に合わない理由を表示し、既存の工程の後ろに保存
  mode = "plan";
  await s.getByRole("button", { name: /AIに相談する/ }).tap();
  const draft = s.getByTestId("ai-draft");
  await expect(draft.getByTestId("ai-feasibility")).toContainText("期限までの完了は難しい見込み");
  await expect(draft.getByTestId("ai-feasibility")).toContainText("週1時間では12月20日までに必要な時間が足りません");
  await expect(draft.getByTestId("capacity-check")).toContainText("不足します");
  await draft.getByRole("button", { name: "この内容で保存する（2工程）" }).tap();
  await s.getByRole("button", { name: "あとで（目標を開く）" }).tap();

  const rows = page.getByTestId("step-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("AI推定");
  const data = await stored(page);
  expect(data.goals).toHaveLength(1);
  expect(data.goalSteps.find((x: { id: string }) => x.id === "s1")).toMatchObject({ title: "単語帳", status: "done", order: 0 });
  expect(data.workLogs).toEqual([expect.objectContaining({ id: "w1", minutes: 60 })]);
  expect(data.tasks).toHaveLength(SAMPLE.tasks.length);

  // 目標詳細からも明日の時間割に追加できる
  await page.getByRole("button", { name: "📅 明日の時間割に追加" }).tap();
  const tomorrow = page.getByTestId("tomorrow-sheet");
  await expect(tomorrow.getByTestId("tomorrow-step")).toHaveCount(2);
  await tomorrow.getByRole("button", { name: "明日の時間割に追加（1件）" }).tap();
  await expect(tomorrow.getByTestId("tomorrow-result")).toContainText("Part5 を毎日10問14:00–15:00");
});

test("提案を保存せずに閉じると何も保存されない", async ({ page }) => {
  await freshStart(page, SAMPLE);
  const before = await stored(page);
  await openAiFromGoalForm(page, { title: "ギターで1曲弾く", criteria: "通して弾ける", deadline: "2026-11-30" });
  const s = sheet(page);
  await s.getByLabel("1週間に使える時間（任意）（時間）").fill("2");
  await s.getByRole("button", { name: /AIに相談する/ }).tap();
  await expect(s.getByTestId("ai-draft")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await s.getByRole("button", { name: "保存せずに閉じる" }).tap();
  await expect(s).toBeHidden();
  const after = await stored(page);
  expect(after.goals ?? []).toHaveLength(0);
  expect(after.goalSteps ?? []).toHaveLength(0);
  expect(after.tasks).toEqual(before.tasks);
});

test("設定画面：AI の状態とモデルの確認（生成しないので回数に数えない）", async ({ page }) => {
  await freshStart(page, SAMPLE);
  await page.goto("/settings");
  const box = page.getByTestId("ai-settings");
  await expect(box).toContainText("仮データ");
  const before = await page.request.get("/api/ai/session").then((r) => r.json());
  await box.getByRole("button", { name: /モデルが使えるか確認する/ }).tap();
  await expect(box.getByTestId("ai-settings-message")).toContainText("利用できます");
  const after = await page.request.get("/api/ai/session").then((r) => r.json());
  expect(after.usage.used).toBe(before.usage.used);
  // API キーなどの秘密の値は状態に含まれない
  expect(Object.keys(after).sort()).toEqual(["authRequired", "authenticated", "misconfigured", "mock", "model", "usage"]);
});
