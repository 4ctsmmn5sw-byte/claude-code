import { z } from "zod";
import { isDateKey } from "../date";
import { normalizeAiResponse } from "./normalize";

/**
 * AI による目標分解の入出力の形。サーバーとブラウザの両方で使う。
 * - 入力：目標の文章と、ユーザーが入力した回答だけ（予定・タスク・カレンダーの内容は含めない）
 * - 出力：構造化 JSON。受け取ったら必ず validateAiResponse で検証する
 * 日付や空き時間の計算は AI に任せず、lib/ai/feasibility.ts の決まった計算で行う。
 */

export const LIMITS = {
  title: 80,
  description: 1000,
  successCriteria: 500,
  situation: 500,
  question: 200,
  answer: 300,
  answers: 8,
  /** リクエスト全体の文字数の上限 */
  totalChars: 4000,
  questions: 4,
  options: 5,
  steps: 15,
  stepTitle: 80,
  stepDetail: 300,
  /** 1 工程の推定時間の範囲（分） */
  stepMinMinutes: 5,
  stepMaxMinutes: 3000,
  summary: 400,
  reason: 400,
} as const;

/* ---------- リクエスト ---------- */

const dateKey = z.string().refine(isDateKey, "日付の形式が正しくありません");

export const planRequestSchema = z.object({
  goal: z.object({
    title: z.string().trim().min(1, "目標名を入力してください").max(LIMITS.title),
    description: z.string().max(LIMITS.description),
    successCriteria: z.string().max(LIMITS.successCriteria),
    deadline: dateKey.nullable(),
  }),
  /** 今の状況・進み具合（任意） */
  situation: z.string().max(LIMITS.situation),
  /** 1 週間に使える時間（分、任意） */
  weeklyMinutes: z.number().int().min(0).max(7 * 24 * 60).nullable(),
  answers: z
    .array(z.object({ question: z.string().max(LIMITS.question), answer: z.string().max(LIMITS.answer) }))
    .max(LIMITS.answers),
  /** 既存の目標に工程を足すとき、重複を避けるための既存の工程名（名前だけ） */
  existingSteps: z.array(z.string().max(LIMITS.stepTitle)).max(LIMITS.steps),
  /** 既存の目標に工程を足すとき、既存の未完了の工程の必要時間の合計（分）。期限までの計算に使う */
  existingRemainingMinutes: z.number().int().min(0).max(1_000_000).optional(),
  /** これ以上質問せず計画を返してほしいとき */
  final: z.boolean(),
  today: dateKey,
});

export type PlanRequest = z.infer<typeof planRequestSchema>;

/** 入力の文字数（全体）。上限を超えたリクエストは拒否する */
export function requestChars(req: PlanRequest): number {
  return (
    req.goal.title.length +
    req.goal.description.length +
    req.goal.successCriteria.length +
    req.situation.length +
    req.answers.reduce((s, a) => s + a.question.length + a.answer.length, 0) +
    req.existingSteps.reduce((s, t) => s + t.length, 0)
  );
}

/* ---------- AI の出力 ---------- */

const PRIORITIES = ["high", "medium", "low"] as const;
const FEASIBILITY = ["ok", "tight", "unlikely", "unknown"] as const;

const aiStepSchema = z.object({
  /** アプリ側で振り直した識別子（s1, s2 …） */
  key: z.string().regex(/^s\d{1,2}$/),
  title: z.string().trim().min(1).max(LIMITS.stepTitle),
  detail: z.string().max(LIMITS.stepDetail),
  estimatedMinutes: z.number().int().min(LIMITS.stepMinMinutes).max(LIMITS.stepMaxMinutes),
  priority: z.enum(PRIORITIES),
  dependsOn: z.array(z.string().regex(/^s\d{1,2}$/)).max(LIMITS.steps),
});

const aiQuestionSchema = z.object({
  /** アプリ側で振り直した識別子（q1, q2 …）。AI が返した id は使わない */
  id: z.string().regex(/^q\d{1,2}$/),
  question: z.string().trim().min(1).max(LIMITS.question),
  why: z.string().max(LIMITS.question),
  options: z.array(z.string().max(60)).max(LIMITS.options),
});

export const aiResponseSchema = z.object({
  ready: z.boolean(),
  questions: z.array(aiQuestionSchema).max(LIMITS.questions),
  plan: z.object({
    summary: z.string().max(LIMITS.summary),
    approach: z.string().max(LIMITS.summary),
    feasibility: z.object({ status: z.enum(FEASIBILITY), reason: z.string().max(LIMITS.reason) }),
    steps: z.array(aiStepSchema).max(LIMITS.steps),
  }),
});

export type AiResponse = z.infer<typeof aiResponseSchema>;
export type AiStep = z.infer<typeof aiStepSchema>;
export type AiQuestion = z.infer<typeof aiQuestionSchema>;
export type Feasibility = (typeof FEASIBILITY)[number];

/**
 * Gemini に渡す JSON スキーマ（responseJsonSchema）。
 * Gemini が対応している範囲（type/properties/required/enum/items/minimum/maximum など）だけを使う。
 */
export const aiResponseJsonSchema = {
  type: "object",
  properties: {
    ready: { type: "boolean", description: "計画を作るのに十分な情報があれば true。質問が必要なら false" },
    questions: {
      type: "array",
      maxItems: LIMITS.questions,
      description: "ready が false のときだけ、計画に必要な情報を尋ねる質問（最大4つ）",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "q1, q2 のような短い識別子" },
          question: { type: "string", description: "日本語の短い質問" },
          why: { type: "string", description: "なぜ必要か（短く）" },
          options: { type: "array", maxItems: LIMITS.options, items: { type: "string" }, description: "選択肢の例（任意）" },
        },
        required: ["id", "question", "why", "options"],
      },
    },
    plan: {
      type: "object",
      properties: {
        summary: { type: "string", description: "計画の要約" },
        approach: { type: "string", description: "期限までの進め方" },
        feasibility: {
          type: "object",
          properties: {
            status: { type: "string", enum: [...FEASIBILITY] },
            reason: { type: "string", description: "期限までに完了できるかの判断と理由" },
          },
          required: ["status", "reason"],
        },
        steps: {
          type: "array",
          maxItems: LIMITS.steps,
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "s1, s2 のような工程の識別子" },
              title: { type: "string", description: "具体的で実行可能な作業名" },
              detail: { type: "string", description: "具体的な作業内容" },
              estimatedMinutes: {
                type: "integer",
                minimum: LIMITS.stepMinMinutes,
                maximum: LIMITS.stepMaxMinutes,
                description: "推定所要時間（分）",
              },
              priority: { type: "string", enum: [...PRIORITIES] },
              dependsOn: { type: "array", items: { type: "string" }, description: "先に終わらせる工程の key" },
            },
            required: ["key", "title", "detail", "estimatedMinutes", "priority", "dependsOn"],
          },
        },
      },
      required: ["summary", "approach", "feasibility", "steps"],
    },
  },
  required: ["ready", "questions", "plan"],
} as const;

export type ValidationResult = { ok: true; data: AiResponse; repairs: string[] } | { ok: false; issues: string[]; repairs: string[] };

/**
 * AI の出力を検証する。
 * 1. normalizeAiResponse で、意味を変えずに直せる違い（長い・重複した id、数字の文字列など）を直す
 * 2. 厳密なスキーマ（型・文字数・数値の範囲）で検証する
 * 3. 工程の key の重複・前提の循環（拒否）、final（これ以上質問しない）なのに計画がない、などを確認する
 */
export function validateAiResponse(raw: unknown, opts: { final: boolean }): ValidationResult {
  const normalized = normalizeAiResponse(raw);
  const repairs = normalized.repairs;
  if (!normalized.ok) return { ok: false, issues: normalized.issues, repairs };
  const parsed = aiResponseSchema.safeParse(normalized.data);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), repairs };
  }
  const data = structuredClone(parsed.data);
  const issues: string[] = [];
  const steps = data.plan.steps;

  if (!data.ready && data.questions.length === 0) issues.push("質問も計画もありません");
  if (opts.final && !data.ready) issues.push("計画が返されませんでした");
  if (data.ready && steps.length === 0) issues.push("工程がありません");
  if (!data.ready) data.plan.steps = [];

  const keys = new Set<string>();
  for (const s of steps) {
    if (keys.has(s.key)) issues.push(`工程の key が重複しています: ${s.key}`);
    keys.add(s.key);
  }
  const qids = new Set(data.questions.map((q) => q.id));
  if (qids.size !== data.questions.length) issues.push("質問の id が重複しています");
  // 存在しない工程・自分自身への前提は取り除く
  for (const s of steps) s.dependsOn = [...new Set(s.dependsOn.filter((d) => d !== s.key && keys.has(d)))];
  if (hasCycle(steps)) issues.push("工程の前提関係が循環しています");

  return issues.length > 0 ? { ok: false, issues, repairs } : { ok: true, data, repairs };
}

export function hasCycle(steps: Pick<AiStep, "key" | "dependsOn">[]): boolean {
  const deps = new Map(steps.map((s) => [s.key, s.dependsOn]));
  const state = new Map<string, 1 | 2>(); // 1: 訪問中, 2: 済
  const visit = (k: string): boolean => {
    if (state.get(k) === 2) return false;
    if (state.get(k) === 1) return true;
    state.set(k, 1);
    for (const d of deps.get(k) ?? []) if (visit(d)) return true;
    state.set(k, 2);
    return false;
  };
  return steps.some((s) => visit(s.key));
}

/* ---------- API の応答 ---------- */

export type PlanErrorCode =
  | "unauthenticated"
  | "not_configured"
  | "invalid_request"
  | "too_long"
  | "daily_limit"
  | "quota_exceeded"
  | "model_unavailable"
  | "bad_api_key"
  | "invalid_output"
  | "timeout"
  | "upstream_error";

export type PlanApiResponse =
  | { ok: true; data: AiResponse; mock: boolean; model: string; usage: { used: number; limit: number } }
  | { ok: false; code: PlanErrorCode; message: string; usage?: { used: number; limit: number } };

export interface AiStatus {
  /** 仮データで動作中（API キー未設定） */
  mock: boolean;
  model: string;
  authRequired: boolean;
  authenticated: boolean;
  /** API キーはあるがパスコードが未設定など、使えない設定 */
  misconfigured: string | null;
  usage: { used: number; limit: number };
}
