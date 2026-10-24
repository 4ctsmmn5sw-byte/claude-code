import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applyComputedFeasibility, capacityMinutes, computedFacts, mentionsQuantities, planMetrics, requiredWeeklyMinutes } from "@/lib/ai/feasibility";
import type { AiResponse, PlanRequest } from "@/lib/ai/planSchema";
import { createSessionValue, LOGIN_LIMITS, SESSION_COOKIE, verifySessionValue } from "@/lib/server/auth";
import { readConfig } from "@/lib/server/config";
import { buildPrompt, type ModelCaller } from "@/lib/server/gemini";
import { handleLogin, handlePlan } from "@/lib/server/handlers";
import type { CounterStore } from "@/lib/server/rateLimit";

/** 第2段階の本番前の確認：時間の計算・本人確認・回数制限・課金につながる処理がないこと */

function testStore(): CounterStore {
  const m = new Map<string, number>();
  return {
    get: async (k) => m.get(k) ?? 0,
    incr: async (k) => {
      m.set(k, (m.get(k) ?? 0) + 1);
      return m.get(k)!;
    },
    decr: async (k) => void m.set(k, Math.max(0, (m.get(k) ?? 0) - 1)),
  };
}

const req = (over: Partial<PlanRequest> = {}): PlanRequest => ({
  goal: { title: "TOEIC 800点", description: "", successCriteria: "800点", deadline: "2027-04-15" },
  situation: "",
  weeklyMinutes: 180,
  answers: [],
  existingSteps: [],
  final: true,
  today: "2026-10-15",
  ...over,
});

const planWith = (minutes: number[], reason = ""): AiResponse => ({
  ready: true,
  questions: [],
  plan: {
    summary: "",
    approach: "",
    feasibility: { status: "ok", reason },
    steps: minutes.map((m, i) => ({ key: `s${i + 1}`, title: `工程${i + 1}`, detail: "", estimatedMinutes: m, priority: "high", dependsOn: [] })),
  },
});

describe("時間の計算（アプリ側）", () => {
  it("6か月・週3時間は約78時間（AI が出した約46時間ではない）", () => {
    // 2026-10-15〜2027-04-15 は両端を含めて 183 日。183 × 180分 ÷ 7 = 4705分 = 78時間25分
    expect(capacityMinutes("2026-10-15", "2027-04-15", 180)).toBe(4705);
    const m = planMetrics({ today: "2026-10-15", deadline: "2027-04-15", weeklyMinutes: 180, planMinutes: 3000 });
    expect(m).toMatchObject({ days: 183, capacityMinutes: 4705, planMinutes: 3000, remainingMinutes: 3000, status: "ok", shortageMinutes: 0 });
    // 3000分を 183 日で終えるには週あたり 3000 × 7 ÷ 183 = 114.75… → 115 分
    expect(m.requiredWeeklyMinutes).toBe(115);
  });

  it("既存の未完了の工程も残りの作業に含める", () => {
    const m = planMetrics({ today: "2026-10-15", deadline: "2027-04-15", weeklyMinutes: 180, planMinutes: 3000, existingRemainingMinutes: 2000 });
    expect(m).toMatchObject({ remainingMinutes: 5000, status: "short", shortageMinutes: 295 });
  });

  it("期限なし・期限切れ", () => {
    expect(planMetrics({ today: "2026-10-15", deadline: null, weeklyMinutes: 180, planMinutes: 60 })).toMatchObject({ days: null, capacityMinutes: null, requiredWeeklyMinutes: null, status: "unknown" });
    expect(requiredWeeklyMinutes(600, 0)).toBeNull();
    expect(requiredWeeklyMinutes(600, 7)).toBe(600);
  });

  it("AI の判断は計算結果で置き換え、数値を含む AI の理由は表示しない", () => {
    // AI は「ok」と言っているが、必要 5000分 > 使える 4705分 なので「難しい」
    const wrongNumbers = applyComputedFeasibility(req(), planWith([3000, 2000], "6か月で約46時間しか使えません"));
    expect(wrongNumbers.plan.feasibility).toEqual({ status: "unlikely", reason: "" });
    const qualitative = applyComputedFeasibility(req(), planWith([600], "前半の基礎を先に固めると後半が楽になります"));
    expect(qualitative.plan.feasibility).toEqual({ status: "ok", reason: "前半の基礎を先に固めると後半が楽になります" });
    // 8割を超えたらぎりぎり
    expect(applyComputedFeasibility(req(), planWith([4000])).plan.feasibility.status).toBe("tight");
    // 使える時間がわからなければ判断しない
    expect(applyComputedFeasibility(req({ weeklyMinutes: null }), planWith([600])).plan.feasibility.status).toBe("unknown");
  });

  it("数値を含む文の判定", () => {
    expect(mentionsQuantities("約46時間")).toBe(true);
    expect(mentionsQuantities("六か月では足りません")).toBe(true);
    expect(mentionsQuantities("週３時間")).toBe(true);
    expect(mentionsQuantities("基礎を先に固めましょう")).toBe(false);
  });

  it("AI には計算済みの数値を渡し、計算させない", () => {
    expect(computedFacts(req())).toEqual({ daysUntilDeadline: 183, availableMinutesUntilDeadline: 4705, existingRemainingMinutes: 0 });
    const prompt = buildPrompt(req({ existingRemainingMinutes: 120 }));
    expect(prompt).toContain('"computed":{"daysUntilDeadline":183,"availableMinutesUntilDeadline":4705,"existingRemainingMinutes":120}');
  });

  it("API の応答でも計算結果の判断になる", async () => {
    const cfg = readConfig({ GEMINI_API_KEY: "k", APP_PASSCODE: "long-enough-1" });
    const caller = vi.fn<ModelCaller>(async () => JSON.stringify(planWith([3000, 2000], "約46時間で足ります")));
    const res = await handlePlan(
      new Request("http://localhost/api/ai/plan", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE}=${createSessionValue(cfg)}` },
        body: JSON.stringify(req()),
      }),
      { cfg, store: testStore(), caller },
    );
    const body = await res.json();
    expect(body.data.plan.feasibility).toEqual({ status: "unlikely", reason: "" });
  });
});

describe("パスコード認証・不正なログイン試行", () => {
  const cfg = readConfig({ GEMINI_API_KEY: "k", APP_PASSCODE: "correct-horse-1" });
  const login = (passcode: string, ip = "203.0.113.1", origin?: string) =>
    new Request("http://localhost/api/ai/session", {
      method: "POST",
      headers: { "x-real-ip": ip, ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify({ passcode }),
    });
  const deps = (store: CounterStore) => ({ cfg, store, failureDelayMs: 0 });

  it("正しいパスコードで HttpOnly・SameSite=Strict の Cookie を発行する", async () => {
    const res = await handleLogin(login("correct-horse-1"), deps(testStore()));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/ai");
  });

  it("同じ IP からの失敗は 15 分に 5 回まで。6 回目は正しくても拒否", async () => {
    const store = testStore();
    for (let i = 0; i < LOGIN_LIMITS.perIp; i++) expect((await handleLogin(login("wrong"), deps(store))).status).toBe(401);
    expect((await handleLogin(login("correct-horse-1"), deps(store))).status).toBe(429);
    // 別の IP からは使える
    expect((await handleLogin(login("correct-horse-1", "198.51.100.7"), deps(store))).status).toBe(200);
  });

  it("IP を変えながらの総当たりは、1 日 20 回の失敗で全体を止める", async () => {
    const store = testStore();
    for (let i = 0; i < LOGIN_LIMITS.globalPerDay; i++) await handleLogin(login("wrong", `192.0.2.${i}`), deps(store));
    const res = await handleLogin(login("correct-horse-1", "198.51.100.99"), deps(store));
    expect(res.status).toBe(429);
    expect((await res.json()).message).toContain("今日はログインを止めています");
  });

  it("他のサイトからのログインは拒否", async () => {
    expect((await handleLogin(login("correct-horse-1", "203.0.113.1", "https://evil.example"), deps(testStore()))).status).toBe(403);
  });

  it("パスコードを変えると、発行済みのログインは無効になる", () => {
    const v = createSessionValue(cfg);
    expect(verifySessionValue(cfg, v)).toBe(true);
    expect(verifySessionValue({ ...cfg, passcode: "another-pass-2" }, v)).toBe(false);
  });

  it("有効期限が先すぎる（改ざんされた）値は拒否", () => {
    const far = createSessionValue(cfg, Date.now() + 365 * 86_400_000);
    expect(verifySessionValue(cfg, far)).toBe(false);
  });
});

describe("課金につながる処理がないこと", () => {
  const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

  it("SDK の自動再試行を止めている（429 で無料枠を余分に使わない）", () => {
    const gemini = src("lib/server/gemini.ts");
    expect(gemini).toContain("retryOptions: { attempts: 1 }");
    expect(gemini.match(/new GoogleGenAI\(/g)?.length).toBe(gemini.match(/httpOptions: NO_RETRY/g)?.length);
  });

  it("モデルの切り替え・課金・Vertex AI に関わる設定を使っていない", () => {
    for (const f of ["lib/server/gemini.ts", "lib/server/handlers.ts", "lib/server/config.ts"]) {
      const s = src(f);
      expect(s).not.toMatch(/vertexai|billing|fallbackModel|project:\s*['"]/i);
    }
  });

  it("1 日の上限は 10 回を超えられない", () => {
    expect(readConfig({ AI_DAILY_LIMIT: "1000" }).dailyLimit).toBe(10);
  });
});
