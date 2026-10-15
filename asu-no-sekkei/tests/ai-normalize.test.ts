import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractJson, normalizeAiResponse } from "@/lib/ai/normalize";
import { validateAiResponse } from "@/lib/ai/planSchema";
import { readConfig } from "@/lib/server/config";
import { parseModelOutput } from "@/lib/server/gemini";
import { handlePlan } from "@/lib/server/handlers";
import { createSessionValue, SESSION_COOKIE } from "@/lib/server/auth";
import type { CounterStore } from "@/lib/server/rateLimit";

/**
 * AI の出力の正規化。実際の Gemini API は呼ばず、保存した応答（tests/fixtures/gemini）で確かめる。
 */

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures/gemini", name), "utf8");
const json = (name: string) => JSON.parse(fixture(name));

afterEach(() => vi.restoreAllMocks());
const quietLogs = () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  return { warn, info };
};

describe("質問の id（20文字を超える id で失敗していた問題）", () => {
  it("長い id はアプリ側の短く一意な id（q1〜）に置き換え、エラーにしない", () => {
    quietLogs();
    const r = parseModelOutput(fixture("long-question-ids.json"), false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
    // 質問文・選択肢はそのまま（並び順も保つ）
    expect(r.data.questions.map((q) => q.question)).toEqual([
      "今のTOEICの点数は何点ですか？",
      "何点を取れたら達成としますか？",
      "1週間に何時間くらい勉強できますか？",
      "受験日は決まっていますか？",
    ]);
    expect(r.data.questions[3].options).toEqual(["決まっている", "まだ"]);
  });

  it("切り詰めると同じになる id・重複した id でも、重複しない id になる", () => {
    const r = validateAiResponse(json("duplicate-truncated-ids.json"), { final: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = r.data.questions.map((q) => q.id);
    expect(ids).toEqual(["q1", "q2", "q3"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.data.questions.map((q) => q.question)).toEqual(["今の進み具合は？", "使える時間は？", "期限は？"]);
    expect(r.repairs.some((x) => x.includes("questions.0.id"))).toBe(true);
  });

  it("質問が多すぎるときは先頭の4問だけ、選択肢は空・重複を除いて5個まで", () => {
    const r = validateAiResponse(json("too-many-questions.json"), { final: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.questions.map((q) => q.question)).toEqual(["質問1", "質問2", "質問3", "質問4"]);
    expect(r.data.questions[0].options).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.repairs).toContain("questions: 4問までにしました");
  });

  it("質問文がない・長すぎる質問は除外し、残りに id を振り直す（途中で切って意味を変えない）", () => {
    const r = validateAiResponse(
      {
        ready: false,
        questions: [
          { id: "a", question: "  ", why: "", options: [] },
          { id: "b", question: "あ".repeat(201), why: "", options: [] },
          { id: "c", question: "期限は？", why: "", options: [] },
        ],
        plan: { summary: "", approach: "", feasibility: { status: "unknown", reason: "" }, steps: [] },
      },
      { final: false },
    );
    expect(r.ok && r.data.questions).toEqual([{ id: "q1", question: "期限は？", why: "", options: [] }]);
  });

  it("使える質問が1つもなければ、理由つきで失敗する", () => {
    const r = validateAiResponse(
      { ready: false, questions: [{ id: "x", question: "" }], plan: {} },
      { final: false },
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues).toContain("質問も計画もありません");
  });
});

describe("工程の key・値の表記ゆれ", () => {
  it("長い key を s1〜に振り直し、前提の対応を保つ", () => {
    const r = validateAiResponse(json("plan-long-keys.json"), { final: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const steps = r.data.plan.steps;
    expect(steps.map((s) => [s.key, s.title, s.estimatedMinutes, s.priority, s.dependsOn])).toEqual([
      ["s1", "単語帳の Unit1〜5 を1周する", 300, "high", []],
      ["s2", "文法問題集を1周する", 600, "medium", ["s1"]],
      ["s3", "模試を1回解く", 120, "low", ["s2"]],
    ]);
    expect(r.data.plan.feasibility.status).toBe("tight");
  });

  it("重複した key を前提にしていて対応が決まらないときは、推測せず失敗する", () => {
    const r = validateAiResponse(json("ambiguous-deps.json"), { final: true });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues.join()).toContain("前提の対応が決まりません");
  });

  it("重複した key でも、前提に使われていなければ振り直して使う", () => {
    const raw = json("ambiguous-deps.json");
    raw.plan.steps[2].dependsOn = [];
    const r = validateAiResponse(raw, { final: true });
    expect(r.ok && r.data.plan.steps.map((s) => s.key)).toEqual(["s1", "s2", "s3"]);
  });

  it("範囲外の推定時間は丸めずに拒否する（検証は緩めない）", () => {
    const r = validateAiResponse(json("out-of-range.json"), { final: true });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues.join()).toContain("estimatedMinutes");
  });

  it("工程名がない・不明な優先度・工程が多すぎる場合は失敗する", () => {
    const base = json("plan-long-keys.json");
    const noTitle = structuredClone(base);
    noTitle.plan.steps[0].title = " ";
    expect(validateAiResponse(noTitle, { final: true }).ok).toBe(false);
    const badPriority = structuredClone(base);
    badPriority.plan.steps[0].priority = "urgent";
    expect(validateAiResponse(badPriority, { final: true }).ok).toBe(false);
    const tooMany = structuredClone(base);
    tooMany.plan.steps = Array.from({ length: 16 }, (_, i) => ({ ...base.plan.steps[0], key: `k${i}`, dependsOn: [] }));
    const r = validateAiResponse(tooMany, { final: true });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0]).toContain("工程が多すぎます");
  });

  it("循環する前提は、振り直した後でも拒否する", () => {
    const raw = json("plan-long-keys.json");
    raw.plan.steps[0].dependsOn = ["mock_exam_step"];
    expect(validateAiResponse(raw, { final: true }).ok).toBe(false);
  });

  it("ready が抜けていても、計画だけ・質問だけなら内容から判断する", () => {
    const plan = json("plan-long-keys.json");
    delete plan.ready;
    expect(validateAiResponse(plan, { final: true }).ok).toBe(true);
    const q = json("long-question-ids.json");
    delete q.ready;
    const r = validateAiResponse(q, { final: false });
    expect(r.ok && r.data.ready).toBe(false);
  });

  it("表示用の長い文章は短縮し、質問と計画が両方あれば計画を優先する", () => {
    const raw = json("plan-long-keys.json");
    raw.plan.summary = "あ".repeat(500);
    raw.questions = json("long-question-ids.json").questions;
    const r = validateAiResponse(raw, { final: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.plan.summary.length).toBe(400);
    expect(r.data.questions).toEqual([]);
  });

  it("final（質問の回答後）なのに質問だけが返ったら失敗する", () => {
    expect(validateAiResponse(json("long-question-ids.json"), { final: true }).ok).toBe(false);
  });
});

describe("JSON の取り出し", () => {
  it("コードブロックや説明文に囲まれた JSON は取り出して使う", () => {
    quietLogs();
    const r = parseModelOutput(fixture("fenced.txt"), true);
    expect(r.ok && r.data.plan.steps[0].title).toBe("準備する");
  });

  it("途中で切れた JSON・空・JSON 以外は、理由つきで失敗する", () => {
    const { warn } = quietLogs();
    const cut = parseModelOutput(fixture("truncated.txt"), true);
    expect(cut).toMatchObject({ ok: false, code: "invalid_output" });
    expect(!cut.ok && cut.message).toContain("途中で切れている");
    expect(extractJson("")).toEqual({ ok: false, reason: "応答が空です" });
    expect(extractJson("申し訳ありません")).toMatchObject({ ok: false });
    expect(normalizeAiResponse([1, 2])).toMatchObject({ ok: false });
    expect(normalizeAiResponse("text")).toMatchObject({ ok: false });
    expect(warn).toHaveBeenCalled();
  });

  it("失敗の理由はログに残すが、ユーザーの入力内容は含めない", () => {
    const { warn } = quietLogs();
    parseModelOutput(fixture("out-of-range.json"), true);
    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("estimatedMinutes");
    expect(logged).not.toContain("全部やる");
  });
});

describe("API を通した動作（保存した応答を使い、Gemini は呼ばない）", () => {
  const store = (): CounterStore => {
    const m = new Map<string, number>();
    return {
      get: async (k) => m.get(k) ?? 0,
      incr: async (k) => {
        m.set(k, (m.get(k) ?? 0) + 1);
        return m.get(k)!;
      },
      decr: async () => {},
    };
  };
  const cfg = readConfig({ GEMINI_API_KEY: "test-key", APP_PASSCODE: "pass-phrase-123" });
  const req = (final: boolean) =>
    new Request("http://localhost/api/ai/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${createSessionValue(cfg)}` },
      body: JSON.stringify({
        goal: { title: "TOEIC 800点", description: "", successCriteria: "", deadline: null },
        situation: "",
        weeklyMinutes: null,
        answers: [],
        existingSteps: [],
        final,
        today: "2026-10-15",
      }),
    });

  it("長い質問 id の応答でも、ユーザーにはエラーを出さず質問を表示できる", async () => {
    quietLogs();
    const caller = vi.fn(async () => fixture("long-question-ids.json"));
    const res = await handlePlan(req(false), { cfg, store: store(), caller });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.questions.map((q: { id: string }) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(caller).toHaveBeenCalledTimes(1); // 再試行しない（無料枠を余分に使わない）
  });

  it("直せない応答は 502 と分かりやすい理由を返し、再試行しない", async () => {
    quietLogs();
    const caller = vi.fn(async () => fixture("ambiguous-deps.json"));
    const res = await handlePlan(req(true), { cfg, store: store(), caller });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "invalid_output" });
    expect(body.message).toContain("もう一度お試しください");
    expect(caller).toHaveBeenCalledTimes(1);
  });
});
