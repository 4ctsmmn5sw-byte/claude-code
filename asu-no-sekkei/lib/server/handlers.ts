import "server-only";
import { planRequestSchema, requestChars, LIMITS, type AiStatus, type PlanApiResponse } from "../ai/planSchema";
import {
  checkPasscode,
  clientIp,
  createSessionValue,
  isAuthenticated,
  LOGIN_LIMITS,
  loginBlocked,
  recordLoginFailure,
  sessionCookieHeader,
} from "./auth";
import { authRequired, misconfiguration, type AiConfig } from "./config";
import { applyComputedFeasibility } from "../ai/feasibility";
import { checkModel, generatePlan, mockPlan, type ModelCaller, type ModelChecker } from "./gemini";
import { consume, storeFor, usage, type CounterStore } from "./rateLimit";

/**
 * AI 機能の API の処理本体（route.ts から呼ぶ）。設定・記録先・SDK 呼び出しを差し替えてテストできる。
 */
export interface Deps {
  cfg: AiConfig;
  store?: CounterStore;
  caller?: ModelCaller;
  checker?: ModelChecker;
  /** テスト用：パスコードを間違えたときの待ち時間 */
  failureDelayMs?: number;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });

/** 同じサイトからの呼び出しだけを受け付ける（他のサイトから勝手に呼ばれないように） */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // 同一オリジンの fetch では付かないことがある
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function handleStatus(req: Request, deps: Deps): Promise<Response> {
  const { cfg } = deps;
  const store = deps.store ?? storeFor(cfg);
  const status: AiStatus = {
    mock: !cfg.apiKey,
    model: cfg.apiKey ? cfg.model : "仮データ",
    authRequired: authRequired(cfg),
    authenticated: isAuthenticated(cfg, req),
    misconfigured: misconfiguration(cfg),
    usage: await usage(store, cfg.dailyLimit),
  };
  return json(status);
}

export async function handleLogin(req: Request, deps: Deps): Promise<Response> {
  const { cfg } = deps;
  if (!sameOrigin(req)) return json({ ok: false, message: "許可されていない呼び出しです" }, 403);
  if (!cfg.passcode) return json({ ok: true });
  if (misconfiguration(cfg)) return json({ ok: false, message: misconfiguration(cfg) }, 503);
  const ip = clientIp(req);
  const store = deps.store ?? storeFor(cfg);
  const blocked = await loginBlocked(store, ip);
  if (blocked === "global") {
    return json({ ok: false, message: "パスコードの誤りが多いため、今日はログインを止めています。太平洋時間の午前0時（日本時間 16〜17時）以降に試してください" }, 429);
  }
  if (blocked === "ip") return json({ ok: false, message: "パスコードの入力回数が多すぎます。15分ほど待ってから試してください" }, 429);
  let passcode = "";
  try {
    const body = (await req.json()) as { passcode?: unknown };
    passcode = typeof body.passcode === "string" ? body.passcode.slice(0, 200) : "";
  } catch {
    /* 空として扱う */
  }
  if (!checkPasscode(cfg, passcode)) {
    await recordLoginFailure(store, ip);
    await new Promise((r) => setTimeout(r, deps.failureDelayMs ?? LOGIN_LIMITS.failureDelayMs));
    return json({ ok: false, message: "パスコードが違います" }, 401);
  }
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookieHeader(cfg, createSessionValue(cfg)) });
}

/** 設定したモデルが使えるかを確認する（本人確認が必要。生成はしないので利用回数に数えない） */
export async function handleModelCheck(req: Request, deps: Deps): Promise<Response> {
  const { cfg } = deps;
  const mis = misconfiguration(cfg);
  if (mis) return json({ ok: false, code: "not_configured", message: mis }, 503);
  if (!isAuthenticated(cfg, req)) return json({ ok: false, code: "unauthenticated", message: "パスコードを入力してください" }, 401);
  if (!cfg.apiKey) return json({ ok: true, model: "仮データ", displayName: "仮データ（API キー未設定）" });
  const r = await checkModel({ apiKey: cfg.apiKey, model: cfg.model, checker: deps.checker });
  return json(r, r.ok ? 200 : 502);
}

export function handleLogout(deps: Deps): Response {
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookieHeader(deps.cfg, null) });
}

export async function handlePlan(req: Request, deps: Deps): Promise<Response> {
  const { cfg } = deps;
  const fail = (status: number, body: Extract<PlanApiResponse, { ok: false }>) => json(body, status);

  if (!sameOrigin(req)) return fail(403, { ok: false, code: "unauthenticated", message: "許可されていない呼び出しです" });
  const mis = misconfiguration(cfg);
  if (mis) return fail(503, { ok: false, code: "not_configured", message: mis });
  if (!isAuthenticated(cfg, req)) {
    return fail(401, { ok: false, code: "unauthenticated", message: "AI 機能を使うにはパスコードを入力してください" });
  }

  // 入力の検証（文字数の上限を含む）。ここで弾いたものは回数に数えない
  const text = await req.text();
  if (text.length > LIMITS.totalChars * 3) return fail(413, { ok: false, code: "too_long", message: "入力が長すぎます" });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, { ok: false, code: "invalid_request", message: "入力の形式が正しくありません" });
  }
  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.code === "too_big");
    return fail(tooLong ? 413 : 400, {
      ok: false,
      code: tooLong ? "too_long" : "invalid_request",
      message: tooLong ? "入力が長すぎます。文字数を減らしてください" : `入力が正しくありません（${parsed.error.issues[0]?.message ?? ""}）`,
    });
  }
  const request = parsed.data;
  if (requestChars(request) > LIMITS.totalChars) {
    return fail(413, { ok: false, code: "too_long", message: `入力は合計${LIMITS.totalChars}文字までです。説明や回答を短くしてください` });
  }

  // 1 日の上限（仮データでも数える：画面の動作を本番と同じにするため）
  const store = deps.store ?? storeFor(cfg);
  const slot = await consume(store, cfg.dailyLimit);
  const usageNow = { used: slot.used, limit: cfg.dailyLimit };
  if (!slot.allowed) {
    return fail(429, {
      ok: false,
      code: "daily_limit",
      message: `今日の AI の利用上限（${cfg.dailyLimit}回）に達しました。太平洋時間の午前0時（日本時間 16〜17時）に回復します`,
      usage: usageNow,
    });
  }

  if (!cfg.apiKey) {
    return json({ ok: true, data: applyComputedFeasibility(request, mockPlan(request)), mock: true, model: "仮データ", usage: usageNow } satisfies PlanApiResponse);
  }
  const result = await generatePlan(request, { apiKey: cfg.apiKey, model: cfg.model, caller: deps.caller });
  if (!result.ok) {
    const status = result.code === "quota_exceeded" ? 429 : result.code === "invalid_output" ? 502 : result.code === "timeout" ? 504 : 502;
    return fail(status, { ok: false, code: result.code, message: result.message, usage: usageNow });
  }
  // 期限に間に合うかは、アプリが計算した数値で判断する
  return json({ ok: true, data: applyComputedFeasibility(request, result.data), mock: false, model: cfg.model, usage: usageNow } satisfies PlanApiResponse);
}
