"use client";

import { useEffect, useState } from "react";
import { useActionGuard } from "@/hooks/useActionGuard";
import { checkAiModel, fetchAiStatus, loginAi, logoutAi } from "@/lib/ai/client";
import type { AiStatus } from "@/lib/ai/planSchema";

/** 設定画面の「AI 機能」。仮データか Gemini か、今日の利用回数、本人確認の状態を表示する */
export function AiSettingsSection() {
  const [status, setStatus] = useState<AiStatus | null | undefined>(undefined);
  const [passcode, setPasscode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const guard = useActionGuard(800);
  const reload = () => fetchAiStatus().then(setStatus);
  useEffect(() => {
    let alive = true;
    fetchAiStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80" data-testid="ai-settings">
      <h2 className="text-[15px] font-semibold text-neutral-900">AI 機能（目標の分解）</h2>
      {status === undefined ? (
        <p className="mt-1 text-xs text-neutral-400">確認中…</p>
      ) : status === null ? (
        <p className="mt-1 text-xs text-rose-600">状態を取得できませんでした</p>
      ) : (
        <div className="mt-2 flex flex-col gap-1 text-sm text-neutral-700">
          <p>
            動作：{status.mock ? "仮データ（GEMINI_API_KEY 未設定）" : `Gemini API 無料枠（${status.model}）`}
          </p>
          <p className="tabular-nums">
            今日の利用：{status.usage.used} / {status.usage.limit} 回（太平洋時間の午前0時に回復）
          </p>
          {status.misconfigured && <p className="text-rose-700">{status.misconfigured}</p>}
          {status.authRequired &&
            (status.authenticated ? (
              <button
                type="button"
                onClick={async () => {
                  await logoutAi();
                  await reload();
                  setMessage("この端末での本人確認を解除しました");
                }}
                className="mt-2 h-11 rounded-xl text-sm text-neutral-600 ring-1 ring-neutral-200"
              >
                本人確認を解除する
              </button>
            ) : (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  guard.run("login", async () => {
                    const r = await loginAi(passcode);
                    setMessage(r.ok ? "本人確認しました" : (r.message ?? "確認できませんでした"));
                    if (r.ok) setPasscode("");
                    await reload();
                  });
                }}
              >
                <input
                  type="password"
                  aria-label="AI 機能のパスコード"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="パスコード"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 text-base"
                />
                <button type="submit" className="h-11 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white">
                  確認
                </button>
              </form>
            ))}
          {(!status.authRequired || status.authenticated) && !status.misconfigured && (
            <button
              type="button"
              onClick={() =>
                guard.run("check", async () => {
                  setMessage("確認中…");
                  const r = await checkAiModel();
                  setMessage(r.ok ? `利用できます：${r.displayName ?? r.model}` : (r.message ?? "確認できませんでした"));
                })
              }
              className="mt-2 h-11 rounded-xl text-sm text-neutral-700 ring-1 ring-neutral-200 active:bg-neutral-50"
            >
              モデルが使えるか確認する（回数に数えません）
            </button>
          )}
          {message && (
            <p className="text-xs text-neutral-600" data-testid="ai-settings-message">
              {message}
            </p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            AI に送るのは目標の内容と質問への回答だけです。無料枠の上限に達したときはエラーで停止し、有料の API には切り替えません。
            無料枠では、送った内容が Google のサービス改善に使われることがあります。
          </p>
        </div>
      )}
    </section>
  );
}
