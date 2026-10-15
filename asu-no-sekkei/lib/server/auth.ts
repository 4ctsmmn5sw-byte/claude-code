import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AiConfig } from "./config";
import { pacificDateKey, type CounterStore } from "./rateLimit";

/**
 * 本人確認（パスコード方式）。外部サービスやデータベースを使わず、費用はかからない。
 * パスコードが合っていれば、有効期限付きの署名済み Cookie（HttpOnly）を発行する。
 * 将来 Google ログインを入れるときは、この部分を差し替える。
 */

export const SESSION_COOKIE = "asu_ai_session";
const SESSION_DAYS = 30;

/** パスコードの指紋（パスコードを変えると、発行済みのログインがすべて無効になる） */
function passcodeTag(cfg: AiConfig): string {
  return createHash("sha256").update(`asu-passcode:${cfg.passcode ?? ""}`).digest("base64url").slice(0, 16);
}

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** 長さに関係なく一定時間で比較する */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPasscode(cfg: AiConfig, input: string): boolean {
  return cfg.passcode !== null && safeEqual(cfg.passcode, input);
}

export function createSessionValue(cfg: AiConfig, now = Date.now()): string {
  if (!cfg.secret) throw new Error("secret is not configured");
  const exp = now + SESSION_DAYS * 86_400_000;
  return `${exp}.${hmac(cfg.secret, `owner.${exp}.${passcodeTag(cfg)}`)}`;
}

export function verifySessionValue(cfg: AiConfig, value: string | undefined, now = Date.now()): boolean {
  if (!value || !cfg.secret) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now || exp > now + SESSION_DAYS * 86_400_000 + 60_000 || !sig) return false;
  return safeEqual(sig, hmac(cfg.secret, `owner.${exp}.${passcodeTag(cfg)}`));
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function isAuthenticated(cfg: AiConfig, req: Request): boolean {
  if (!cfg.passcode) return true; // パスコード未設定（仮データのみ）のときは確認不要
  return verifySessionValue(cfg, readCookie(req, SESSION_COOKIE));
}

export function sessionCookieHeader(cfg: AiConfig, value: string | null): string {
  const attrs = ["Path=/api/ai", "HttpOnly", "SameSite=Strict", cfg.secureCookie ? "Secure" : ""].filter(Boolean);
  return value === null
    ? `${SESSION_COOKIE}=; Max-Age=0; ${attrs.join("; ")}`
    : `${SESSION_COOKIE}=${encodeURIComponent(value)}; Max-Age=${SESSION_DAYS * 86_400}; ${attrs.join("; ")}`;
}

/* ---------- パスコードの総当たり対策 ----------
 * - 同じ IP からの失敗は 15 分に 5 回まで
 * - すべての IP を合わせた失敗は 1 日（太平洋時間）に 20 回まで。超えたらその日はログインを受け付けない
 *   （IP を変えながらの総当たりを止める。正しいパスコードでも受け付けない）
 * - 失敗時は少し待ってから応答する
 * 記録先は呼び出し回数と同じ（Upstash があればそこ、なければサーバーのメモリ）。
 */

export const LOGIN_LIMITS = { perIp: 5, perIpWindowMinutes: 15, globalPerDay: 20, failureDelayMs: 400 } as const;

export function clientIp(req: Request): string {
  // Vercel が設定する x-real-ip を優先（利用者が書き換えられない）。なければ x-forwarded-for の先頭
  return req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function ipKey(ip: string, now: number): string {
  const window = Math.floor(now / (LOGIN_LIMITS.perIpWindowMinutes * 60_000));
  const h = createHash("sha256").update(ip).digest("base64url").slice(0, 16); // IP はそのまま保存しない
  return `asu:auth:fail:ip:${h}:${window}`;
}
const globalKey = (now: number) => `asu:auth:fail:all:${pacificDateKey(new Date(now))}`;

export async function loginBlocked(store: CounterStore, ip: string, now = Date.now()): Promise<"ip" | "global" | null> {
  if ((await store.get(globalKey(now))) >= LOGIN_LIMITS.globalPerDay) return "global";
  if ((await store.get(ipKey(ip, now))) >= LOGIN_LIMITS.perIp) return "ip";
  return null;
}

export async function recordLoginFailure(store: CounterStore, ip: string, now = Date.now()) {
  await store.incr(ipKey(ip, now), LOGIN_LIMITS.perIpWindowMinutes * 60);
  await store.incr(globalKey(now), 2 * 86_400);
}
