"use client";

import { useCallback, useRef, useState } from "react";

/**
 * ボタンの連打による重複操作を防ぐ。
 * - 同じ key の処理が実行中（非同期なら完了まで）は、次の呼び出しを無視する
 * - 同期の処理は、完了後も cooldownMs の間は無視する（ダブルタップ・連打の 2 回目を受け付けない）
 * 判定は ref で同期的に行うので、再描画の前に届いた 2 回目のタップも止められる。
 * 時間をおいた操作（同じ工程を別の日に練習するために、もう一度タスクにする等）はそのまま行える。
 */
export function useActionGuard(cooldownMs = 1000) {
  const until = useRef(new Map<string, number>());
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());

  const setBusy = useCallback((key: string, on: boolean) => {
    setBusyKeys((cur) => {
      if (cur.has(key) === on) return cur;
      const next = new Set(cur);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const release = useCallback(
    (key: string) => {
      const end = performance.now() + cooldownMs;
      until.current.set(key, end);
      setTimeout(() => {
        if (until.current.get(key) === end) {
          until.current.delete(key);
          setBusy(key, false);
        }
      }, cooldownMs);
    },
    [cooldownMs, setBusy],
  );

  /** fn を実行する。連打で無視したときは false を返す */
  const run = useCallback(
    (key: string, fn: () => unknown): boolean => {
      const now = performance.now();
      const u = until.current.get(key);
      if (u !== undefined && (u === Infinity || now < u)) return false;
      until.current.set(key, Infinity);
      setBusy(key, true);
      let result: unknown;
      try {
        result = fn();
      } catch (e) {
        release(key);
        throw e;
      }
      if (result instanceof Promise) {
        // 非同期の処理（通信など）は完了まで受け付けず、完了したらすぐ次の操作を受け付ける
        result
          .finally(() => {
            until.current.delete(key);
            setBusy(key, false);
          })
          .catch(() => {});
      } else {
        release(key);
      }
      return true;
    },
    [release, setBusy],
  );

  const isBusy = useCallback((key: string) => busyKeys.has(key), [busyKeys]);
  return { run, isBusy };
}
