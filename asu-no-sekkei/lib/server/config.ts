import "server-only";

/**
 * AI 機能のサーバー側の設定（環境変数）。ブラウザには送らない。
 * - GEMINI_API_KEY：Gemini API のキー。未設定なら仮データで動作する
 * - GEMINI_MODEL：使うモデル（既定 gemini-2.5-flash）
 * - APP_PASSCODE：AI 機能を使うためのパスコード（本人確認）。API キーがあるのに未設定なら AI を使えない
 * - AUTH_SECRET：ログイン状態の署名に使う秘密の値（未設定なら APP_PASSCODE から作る）
 * - AI_DAILY_LIMIT：1 日の呼び出し上限（既定 10。Google の無料枠がこれより少なければ下げる）
 * - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN：呼び出し回数の永続的な記録（任意）
 */
export interface AiConfig {
  apiKey: string | null;
  model: string;
  passcode: string | null;
  secret: string | null;
  dailyLimit: number;
  upstash: { url: string; token: string } | null;
  secureCookie: boolean;
}

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_DAILY_LIMIT = 10;
/** パスコードの最低文字数（総当たりで当てられにくくするため） */
export const MIN_PASSCODE_LENGTH = 8;

const MODEL_PATTERN = /^[a-z0-9][a-z0-9.\-]{2,60}$/;

export function readConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const passcode = env.APP_PASSCODE?.trim() || null;
  const limit = Number(env.AI_DAILY_LIMIT);
  const model = env.GEMINI_MODEL?.trim();
  return {
    apiKey: env.GEMINI_API_KEY?.trim() || null,
    model: model && MODEL_PATTERN.test(model) ? model : DEFAULT_MODEL,
    passcode,
    secret: env.AUTH_SECRET?.trim() || (passcode ? `passcode:${passcode}` : null),
    // 上限は 1〜10 回。既定より多くはできない（無料枠を守るため）
    dailyLimit: Number.isInteger(limit) && limit >= 1 ? Math.min(limit, DEFAULT_DAILY_LIMIT) : DEFAULT_DAILY_LIMIT,
    upstash:
      env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
        ? { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }
        : null,
    secureCookie: env.NODE_ENV === "production",
  };
}

/** 使えない設定の説明（使えるなら null） */
export function misconfiguration(cfg: AiConfig): string | null {
  if (cfg.apiKey && !cfg.passcode) {
    return "GEMINI_API_KEY が設定されていますが、APP_PASSCODE が未設定のため AI 機能を止めています（第三者に使われないため）";
  }
  if (cfg.apiKey && cfg.passcode && cfg.passcode.length < MIN_PASSCODE_LENGTH) {
    return `APP_PASSCODE が短すぎるため AI 機能を止めています。${MIN_PASSCODE_LENGTH}文字以上にしてください（総当たりで当てられないため）`;
  }
  return null;
}

/** パスコードが設定されていれば本人確認が必要 */
export function authRequired(cfg: AiConfig): boolean {
  return cfg.passcode !== null;
}
