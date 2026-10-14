import "server-only";
import type { AiConfig } from "./config";

/**
 * AI の 1 日の呼び出し回数の制限（サーバー側）。
 * 日の区切りは Google の無料枠と同じ「太平洋時間の午前0時」。
 * - UPSTASH_REDIS_REST_URL / TOKEN があれば Upstash Redis に記録（サーバーが再起動しても保たれる）
 * - なければサーバーのメモリに記録（再起動や複数台に分かれると数え直しになる。
 *   その場合も Google 側の無料枠の上限で止まるため、料金は発生しない）
 */

export interface CounterStore {
  get(key: string): Promise<number>;
  /** 1 増やして新しい値を返す。ttlSeconds 後に消える */
  incr(key: string, ttlSeconds: number): Promise<number>;
  /** 1 減らす（呼び出す前に失敗した場合の取り消し） */
  decr(key: string): Promise<void>;
}

const memory: Map<string, number> = ((globalThis as { __asuAiCounter?: Map<string, number> }).__asuAiCounter ??= new Map());

export const memoryStore: CounterStore = {
  async get(key) {
    return memory.get(key) ?? 0;
  },
  async incr(key) {
    const v = (memory.get(key) ?? 0) + 1;
    memory.set(key, v);
    return v;
  },
  async decr(key) {
    memory.set(key, Math.max(0, (memory.get(key) ?? 0) - 1));
  },
};

export function upstashStore(url: string, token: string): CounterStore {
  const call = async (commands: (string | number)[][]) => {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`counter store error ${res.status}`);
    return (await res.json()) as { result: unknown }[];
  };
  return {
    async get(key) {
      const [r] = await call([["GET", key]]);
      return Number(r?.result ?? 0) || 0;
    },
    async incr(key, ttl) {
      const [r] = await call([["INCR", key], ["EXPIRE", key, ttl]]);
      return Number(r?.result ?? 0);
    },
    async decr(key) {
      await call([["DECR", key]]);
    },
  };
}

export function storeFor(cfg: AiConfig): CounterStore {
  return cfg.upstash ? upstashStore(cfg.upstash.url, cfg.upstash.token) : memoryStore;
}

/** 太平洋時間の日付（Google の無料枠の日の区切り） */
export function pacificDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function counterKey(now = new Date()): string {
  return `asu:ai:owner:${pacificDateKey(now)}`;
}

/** 1 回分を使う。上限を超えるなら使わずに allowed: false */
export async function consume(store: CounterStore, limit: number, now = new Date()): Promise<{ allowed: boolean; used: number; key: string }> {
  const key = counterKey(now);
  const used = await store.incr(key, 2 * 86_400);
  if (used > limit) {
    await store.decr(key);
    return { allowed: false, used: limit, key };
  }
  return { allowed: true, used, key };
}

export async function usage(store: CounterStore, limit: number, now = new Date()) {
  return { used: Math.min(limit, await store.get(counterKey(now))), limit };
}
