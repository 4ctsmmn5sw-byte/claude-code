import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AiConfig } from "./config";

/**
 * 本人確認（パスコード方式）。外部サービスやデータベースを使わず、費用はかからない。
 * パスコードが合っていれば、有効期限付きの署名済み Cookie（HttpOnly）を発行する。
 * 将来 Google ログインを入れるときは、この部分を差し替える。
 */

export const SESSION_COOKIE = "asu_ai_session";
const SESSION_DAYS = 30;

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
  return `${exp}.${hmac(cfg.secret, `owner.${exp}`)}`;
}

export function verifySessionValue(cfg: AiConfig, value: string | undefined, now = Date.now()): boolean {
  if (!value || !cfg.secret) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now || !sig) return false;
  return safeEqual(sig, hmac(cfg.secret, `owner.${exp}`));
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

/* ---------- パスコードの総当たり対策（同じ IP から 15 分に 5 回まで） ---------- */

const attempts: Map<string, number[]> = ((globalThis as { __asuAuthAttempts?: Map<string, number[]> }).__asuAuthAttempts ??= new Map());

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export function tooManyAttempts(ip: string, now = Date.now()): boolean {
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
  attempts.set(ip, recent);
  return recent.length >= 5;
}

export function recordFailedAttempt(ip: string, now = Date.now()) {
  attempts.set(ip, [...(attempts.get(ip) ?? []), now]);
}
