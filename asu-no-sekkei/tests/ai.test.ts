import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { capacityMinutes, checkCapacity } from "@/lib/ai/feasibility";
import { LIMITS, validateAiResponse, type PlanRequest } from "@/lib/ai/planSchema";
import { createSessionValue, SESSION_COOKIE, verifySessionValue } from "@/lib/server/auth";
import { misconfiguration, readConfig, type AiConfig } from "@/lib/server/config";
import { buildPrompt, checkModel, mapError, mockPlan, parseModelOutput, type ModelCaller } from "@/lib/server/gemini";
import { handleModelCheck, handlePlan, handleStatus } from "@/lib/server/handlers";
import { consume, pacificDateKey, type CounterStore } from "@/lib/server/rateLimit";

/* ---------- 共通 ---------- */

const plan = (over: Record<string, unknown> = {}) => ({
  ready: true,
  questions: [],
  plan: {
    summary: "3つに分けました",
    approach: "基礎から",
    feasibility: { status: "ok", reason: "週5時間なら間に合う" },
    steps: [
      { key: "a", title: "単語帳 Unit1-3 を覚える", detail: "1日20語", estimatedMinutes: 300, priority: "high", dependsOn: [] },
      { key: "b", title: "文法問題集を1周", detail: "", estimatedMinutes: 600, priority: "medium", dependsOn: ["a"] },
      { key: "c", title: "模試を解く", detail: "", estimatedMinutes: 120, priority: "low", dependsOn: ["b"] },
    ],
    ...over,
  },
});

const request = (over: Partial<PlanRequest> = {}): PlanRequest => ({
  goal: { title: "TOEIC 800点", description: "", successCriteria: "公式テストで800点", deadline: "2026-12-20" },
  situation: "今は650点",
  weeklyMinutes: 300,
  answers: [],
  existingSteps: [],
  final: false,
  today: "2026-10-14",
  ...over,
});

function testStore(): CounterStore & { map: Map<string, number> } {
  const map = new Map<string, number>();
  return {
    map,
    async get(k) {
      return map.get(k) ?? 0;
    },
    async incr(k) {
      const v = (map.get(k) ?? 0) + 1;
      map.set(k, v);
      return v;
    },
    async decr(k) {
      map.set(k, Math.max(0, (map.get(k) ?? 0) - 1));
    },
  };
}

const cfgWith = (over: Partial<AiConfig> = {}): AiConfig => ({
  ...readConfig({ GEMINI_API_KEY: "test-key", APP_PASSCODE: "secret-pass" }),
  ...over,
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/ai/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const authed = (cfg: AiConfig) => ({ Cookie: `${SESSION_COOKIE}=${createSessionValue(cfg)}` });

/* ---------- AI の出力形式 ---------- */

describe("AI の応答の検証（スキーマ）", () => {
  it("正しい計画を受け付ける", () => {
    const r = validateAiResponse(plan(), { final: true });
    expect(r.ok).toBe(true);
  });

  it("形式が違う・範囲外の値は拒否する", () => {
    expect(validateAiResponse({ ready: "yes" }, { final: false }).ok).toBe(false);
    const tooLong = plan();
    tooLong.plan.steps[0].estimatedMinutes = LIMITS.stepMaxMinutes + 1;
    expect(validateAiResponse(tooLong, { final: true }).ok).toBe(false);
    const badPriority = plan();
    (badPriority.plan.steps[0] as { priority: string }).priority = "urgent";
    expect(validateAiResponse(badPriority, { final: true }).ok).toBe(false);
  });

  it("前提関係の循環・重複キーを拒否し、存在しない前提は外す", () => {
    const cyc = plan();
    cyc.plan.steps[0].dependsOn = ["c"];
    expect(validateAiResponse(cyc, { final: true }).ok).toBe(false);

    const dup = plan();
    dup.plan.steps[1].key = "a";
    expect(validateAiResponse(dup, { final: true }).ok).toBe(false);

    const dangling = plan();
    dangling.plan.steps[0].dependsOn = ["zzz"];
    const r = validateAiResponse(dangling, { final: true });
    expect(r.ok && r.data.plan.steps[0].dependsOn).toEqual([]);
  });

  it("最終回（final）で計画がなければ拒否する", () => {
    const q = { ready: false, questions: [{ id: "q1", question: "今の点数は？", why: "", options: [] }], plan: plan({ steps: [] }).plan };
    expect(validateAiResponse(q, { final: false }).ok).toBe(true);
    expect(validateAiResponse(q, { final: true }).ok).toBe(false);
  });

  it("JSON でない応答は invalid_output", () => {
    expect(parseModelOutput("申し訳ありません", true)).toMatchObject({ ok: false, code: "invalid_output" });
    expect(parseModelOutput(JSON.stringify(plan()), true).ok).toBe(true);
  });
});

describe("AI に送る内容（最小限）", () => {
  it("目標の文章と回答だけを送り、時間割・タスク・予定は含まない", () => {
    const p = buildPrompt(request());
    const sent = JSON.parse(p.slice(p.indexOf("{")));
    expect(Object.keys(sent).sort()).toEqual(
      expect.arrayContaining(["goal", "answers"]),
    );
    expect(p).not.toMatch(/fixedEvents|tasks|大学|アルバイト|calendar/i);
  });
});

/* ---------- 期限までの計算（AI を使わない） ---------- */

describe("期限までに使える時間", () => {
  it("週の時間と日数から計算し、不足を出す", () => {
    // 今日と期限の両方を含む（10/14〜10/20 の 7 日 = 1 週間分）
    expect(capacityMinutes("2026-10-14", "2026-10-20", 300)).toBe(300);
    expect(capacityMinutes("2026-10-14", "2026-10-01", 300)).toBe(0);
    expect(capacityMinutes("2026-10-14", null, 300)).toBeNull();
    expect(checkCapacity(1020, 300)).toMatchObject({ status: "short", shortageMinutes: 720 });
    expect(checkCapacity(250, 300).status).toBe("tight");
    expect(checkCapacity(100, 300).status).toBe("ok");
  });
});

/* ---------- 設定・本人確認・回数制限 ---------- */

describe("設定", () => {
  it("1日の上限は 1〜10 回（10 より多くはできない）", () => {
    expect(readConfig({}).dailyLimit).toBe(10);
    expect(readConfig({ AI_DAILY_LIMIT: "5" }).dailyLimit).toBe(5);
    expect(readConfig({ AI_DAILY_LIMIT: "500" }).dailyLimit).toBe(10);
    expect(readConfig({ AI_DAILY_LIMIT: "0" }).dailyLimit).toBe(10);
  });

  it("モデル名の既定は gemini-2.5-flash、変な値は無視する", () => {
    expect(readConfig({}).model).toBe("gemini-2.5-flash");
    expect(readConfig({ GEMINI_MODEL: "gemini-2.5-flash-lite" }).model).toBe("gemini-2.5-flash-lite");
    expect(readConfig({ GEMINI_MODEL: "../../x?key=1" }).model).toBe("gemini-2.5-flash");
  });

  it("API キーがあるのにパスコードがなければ使えない", () => {
    expect(misconfiguration(readConfig({ GEMINI_API_KEY: "k" }))).not.toBeNull();
    expect(misconfiguration(readConfig({ GEMINI_API_KEY: "k", APP_PASSCODE: "long-enough-1" }))).toBeNull();
    // 短すぎるパスコードは総当たりで当てられるため使わない
    expect(misconfiguration(readConfig({ GEMINI_API_KEY: "k", APP_PASSCODE: "1234567" }))).toContain("8文字以上");
    expect(misconfiguration(readConfig({}))).toBeNull(); // 仮データ
  });
});

describe("本人確認（署名付きの Cookie）", () => {
  it("正しい署名だけを受け付け、期限切れ・改ざんは拒否する", () => {
    const cfg = cfgWith();
    const v = createSessionValue(cfg, 1_000_000);
    expect(verifySessionValue(cfg, v, 1_000_000 + 1000)).toBe(true);
    expect(verifySessionValue(cfg, v, 1_000_000 + 31 * 24 * 3600 * 1000)).toBe(false);
    expect(verifySessionValue(cfg, v.replace(/.$/, (c) => (c === "a" ? "b" : "a")), 1_000_000)).toBe(false);
    expect(verifySessionValue(cfgWith({ secret: "other" }), v, 1_000_000)).toBe(false);
  });
});

describe("1日の呼び出し回数の制限", () => {
  it("上限まで許可し、超えたら拒否する（太平洋時間の日付ごと）", async () => {
    const store = testStore();
    const at = new Date("2026-10-14T03:00:00Z"); // 太平洋時間では 10/13
    expect(pacificDateKey(at)).toBe("2026-10-13");
    for (let i = 1; i <= 3; i++) expect(await consume(store, 3, at)).toMatchObject({ allowed: true, used: i });
    expect((await consume(store, 3, at)).allowed).toBe(false);
    // 太平洋時間の翌日には回復
    expect((await consume(store, 3, new Date("2026-10-14T08:00:00Z"))).allowed).toBe(true);
  });
});

/* ---------- API（handlePlan）のエラー時の動作 ---------- */

describe("POST /api/ai/plan", () => {
  it("本人確認がなければ 401、Gemini は呼ばない", async () => {
    const caller = vi.fn<ModelCaller>();
    const res = await handlePlan(post(request()), { cfg: cfgWith(), store: testStore(), caller });
    expect(res.status).toBe(401);
    expect(caller).not.toHaveBeenCalled();
  });

  it("パスコード未設定でキーだけあると 503", async () => {
    const cfg = cfgWith({ passcode: null, secret: null });
    const res = await handlePlan(post(request()), { cfg, store: testStore(), caller: vi.fn<ModelCaller>() });
    expect(res.status).toBe(503);
  });

  it("他のサイトからの呼び出しは拒否", async () => {
    const cfg = cfgWith();
    const res = await handlePlan(post(request(), { ...authed(cfg), Origin: "https://evil.example" }), { cfg, store: testStore(), caller: vi.fn<ModelCaller>() });
    expect(res.status).toBe(403);
  });

  it("入力が長すぎると 413 で、回数に数えない", async () => {
    const cfg = cfgWith();
    const store = testStore();
    const caller = vi.fn<ModelCaller>();
    const long = request({ situation: "あ".repeat(LIMITS.situation + 1) });
    expect((await handlePlan(post(long, authed(cfg)), { cfg, store, caller })).status).toBe(413);
    const total = request({
      goal: { title: "a", description: "あ".repeat(LIMITS.description), successCriteria: "い".repeat(LIMITS.successCriteria), deadline: null },
      situation: "う".repeat(LIMITS.situation),
      answers: Array.from({ length: 8 }, () => ({ question: "q".repeat(LIMITS.question), answer: "a".repeat(LIMITS.answer) })),
    });
    expect((await handlePlan(post(total, authed(cfg)), { cfg, store, caller })).status).toBe(413);
    expect((await handlePlan(post("not json", authed(cfg)), { cfg, store, caller })).status).toBe(400);
    expect(caller).not.toHaveBeenCalled();
    expect([...store.map.values()]).toEqual([]);
  });

  it("成功すると検証済みの計画を返し、回数を数える", async () => {
    const cfg = cfgWith();
    const store = testStore();
    const caller = vi.fn<ModelCaller>(async () => JSON.stringify(plan()));
    const res = await handlePlan(post(request({ final: true }), authed(cfg)), { cfg, store, caller });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, mock: false, model: "gemini-2.5-flash", usage: { used: 1, limit: 10 } });
    expect(body.data.plan.steps).toHaveLength(3);
    expect(caller).toHaveBeenCalledTimes(1);
    expect(caller.mock.calls[0][0]).toMatchObject({ apiKey: "test-key", model: "gemini-2.5-flash" });
  });

  it("1日の上限を超えると 429（daily_limit）で、Gemini は呼ばない", async () => {
    const cfg = cfgWith({ dailyLimit: 2 });
    const store = testStore();
    const caller = vi.fn<ModelCaller>(async () => JSON.stringify(plan()));
    for (let i = 0; i < 2; i++) expect((await handlePlan(post(request(), authed(cfg)), { cfg, store, caller })).status).toBe(200);
    const res = await handlePlan(post(request(), authed(cfg)), { cfg, store, caller });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, code: "daily_limit" });
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("Google の無料枠超過（429）は停止し、再試行も別モデルへの切り替えもしない", async () => {
    const cfg = cfgWith();
    const caller = vi.fn<ModelCaller>(async () => {
      throw new ApiError({ message: "RESOURCE_EXHAUSTED", status: 429 });
    });
    const res = await handlePlan(post(request(), authed(cfg)), { cfg, store: testStore(), caller });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "quota_exceeded" });
    expect(body.message).toContain("有料の API には切り替えません");
    expect(caller).toHaveBeenCalledTimes(1);
    expect(new Set(caller.mock.calls.map((c) => c[0].model))).toEqual(new Set(["gemini-2.5-flash"]));
  });

  it("AI の応答が壊れていれば 502（invalid_output）", async () => {
    const cfg = cfgWith();
    const res = await handlePlan(post(request({ final: true }), authed(cfg)), { cfg, store: testStore(), caller: async () => '{"ready":true}' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "invalid_output" });
  });

  it("API キーがなければ仮データで動く（キー不要）", async () => {
    const cfg = readConfig({});
    const caller = vi.fn<ModelCaller>();
    const first = await (await handlePlan(post(request({ weeklyMinutes: null })), { cfg, store: testStore(), caller })).json();
    expect(first).toMatchObject({ ok: true, mock: true, data: { ready: false } });
    expect(first.data.questions.length).toBeGreaterThan(0);
    const second = await (await handlePlan(post(request({ final: true })), { cfg, store: testStore(), caller })).json();
    expect(second.data.ready).toBe(true);
    expect(validateAiResponse(second.data, { final: true }).ok).toBe(true);
    expect(caller).not.toHaveBeenCalled();
  });
});

describe("エラーの対応づけ", () => {
  it("HTTP の状態ごとに止める理由を返す", () => {
    expect(mapError(new ApiError({ message: "x", status: 429 }), "m").code).toBe("quota_exceeded");
    expect(mapError(new ApiError({ message: "x", status: 404 }), "m").code).toBe("model_unavailable");
    expect(mapError(new ApiError({ message: "x", status: 403 }), "m").code).toBe("bad_api_key");
    expect(mapError(new ApiError({ message: "API key not valid", status: 400 }), "m").code).toBe("bad_api_key");
    expect(mapError(new ApiError({ message: "x", status: 500 }), "m").code).toBe("upstream_error");
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(mapError(abort, "m").code).toBe("timeout");
  });
});

describe("状態の確認・モデルの確認", () => {
  it("状態にキーやパスコードは含まない", async () => {
    const cfg = cfgWith();
    const body = await (await handleStatus(new Request("http://localhost/api/ai/session"), { cfg, store: testStore() })).json();
    expect(JSON.stringify(body)).not.toMatch(/test-key|secret-pass/);
    expect(body).toMatchObject({ mock: false, authRequired: true, authenticated: false, usage: { used: 0, limit: 10 } });
  });

  it("モデルの確認は本人確認が必要で、生成しない", async () => {
    const cfg = cfgWith();
    const checker = vi.fn(async () => ({ name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash" }));
    expect((await handleModelCheck(new Request("http://localhost/api/ai/session?check=model"), { cfg, checker })).status).toBe(401);
    const ok = await handleModelCheck(new Request("http://localhost/api/ai/session?check=model", { headers: authed(cfg) }), { cfg, checker });
    expect(await ok.json()).toMatchObject({ ok: true, displayName: "Gemini 2.5 Flash" });
    const missing = await checkModel({ apiKey: "k", model: "nope", checker: async () => Promise.reject(new ApiError({ message: "x", status: 404 })) });
    expect(missing).toMatchObject({ ok: false, code: "model_unavailable" });
  });
});

describe("仮データ", () => {
  it("情報が足りなければ質問し、回答後は計画を返す", () => {
    expect(mockPlan(request({ goal: { ...request().goal, deadline: null } })).ready).toBe(false);
    expect(mockPlan(request({ goal: { ...request().goal, deadline: null }, final: true })).ready).toBe(true);
  });
});
