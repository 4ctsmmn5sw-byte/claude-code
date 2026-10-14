"use client";

import { useRef, useState } from "react";
import {
  backupFileName,
  buildBackupFile,
  deleteLocalBackup,
  listLocalBackups,
  parseBackupFile,
  summarize,
  type LocalBackup,
} from "@/lib/backup";
import type { LoadResult } from "@/lib/storage";
import { actions } from "@/lib/store";
import type { AppData } from "@/lib/types";
import { Modal } from "./Modal";

/**
 * バックアップと復元。
 * 復元は必ず中身の件数を確認してから行い、置き換える前のデータはこのブラウザ内に退避する。
 */
export function BackupSection({ data, onMessage }: { data: AppData; onMessage: (m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ result: LoadResult; source: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locals, setLocals] = useState<LocalBackup[] | null>(null);
  const counts = summarize(data);

  const download = () => {
    const blob = new Blob([JSON.stringify(buildBackupFile(data), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onMessage("バックアップを書き出しました");
  };

  return (
    <section className="rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80" data-testid="backup-section">
      <h2 className="text-[15px] font-semibold text-neutral-900">バックアップと復元</h2>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
        タスク{counts.tasks}件・固定予定{counts.fixedEvents}件・目標{counts.goals}件・工程{counts.goalSteps}件・作業記録{counts.workLogs}件を、
        1つのファイルに書き出せます。機種変更の前や大きな変更の前に保存しておくと安心です。
      </p>
      <button type="button" onClick={download} className="mt-3 h-12 w-full rounded-2xl bg-neutral-900 text-[15px] font-semibold text-white active:bg-neutral-700">
        バックアップを書き出す
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="mt-2 h-12 w-full rounded-2xl text-[15px] font-medium text-neutral-800 ring-1 ring-neutral-200 active:bg-neutral-50"
      >
        ファイルから復元
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-testid="restore-file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const parsed = parseBackupFile(await file.text());
          if (!parsed.ok) return setError(parsed.message);
          setError(null);
          setPending({ result: parsed.result, source: file.name });
        }}
      />
      <button
        type="button"
        onClick={() => setLocals(listLocalBackups())}
        className="mt-2 h-11 w-full rounded-2xl text-sm text-neutral-600 active:bg-neutral-100"
      >
        このブラウザ内の自動退避データを見る
      </button>
      {error && (
        <p className="mt-2 text-sm text-rose-600" role="alert">
          {error}
        </p>
      )}

      {locals && (
        <Modal title="自動退避データ" onClose={() => setLocals(null)} testId="local-backups">
          <p className="mb-3 text-xs leading-relaxed text-neutral-500">
            復元の前や、保存データを読み込めなかったとき、形式を更新する前に自動で保存されたデータです（最新10件まで）。
          </p>
          {locals.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">退避データはありません</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {locals.map((b) => {
                const c = b.result ? summarize(b.result.data) : null;
                return (
                  <li key={b.key} className="rounded-2xl bg-neutral-50 p-3">
                    <div className="text-sm font-medium text-neutral-900">{b.reason}</div>
                    <div className="text-xs text-neutral-500">
                      {b.createdAt ? new Date(b.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "日時不明"}
                      {c && ` ・ タスク${c.tasks} 固定予定${c.fixedEvents} 目標${c.goals}`}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={!b.result}
                        onClick={() => {
                          if (b.result) setPending({ result: b.result, source: b.reason });
                          setLocals(null);
                        }}
                        className="h-11 flex-1 rounded-xl bg-white text-sm ring-1 ring-neutral-200 disabled:opacity-40"
                      >
                        この時点に戻す
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm("この退避データを削除しますか？")) return;
                          deleteLocalBackup(b.key);
                          setLocals(listLocalBackups());
                        }}
                        className="h-11 rounded-xl px-3 text-sm text-rose-600"
                      >
                        削除
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Modal>
      )}

      {pending && (
        <RestoreConfirm
          pending={pending}
          current={counts}
          onClose={() => setPending(null)}
          onDone={(m) => {
            setPending(null);
            onMessage(m);
          }}
        />
      )}
    </section>
  );
}

function RestoreConfirm({
  pending,
  current,
  onClose,
  onDone,
}: {
  pending: { result: LoadResult; source: string };
  current: ReturnType<typeof summarize>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const next = summarize(pending.result.data);
  const row = (label: string, a: number, b: number) => (
    <tr>
      <td className="py-1 text-neutral-500">{label}</td>
      <td className="py-1 text-right tabular-nums">{a}</td>
      <td className="px-2 text-neutral-300">→</td>
      <td className="py-1 text-right font-semibold tabular-nums">{b}</td>
    </tr>
  );
  return (
    <Modal title="バックアップから復元" onClose={onClose} testId="restore-confirm">
      <p className="text-sm text-neutral-700">「{pending.source}」の内容で、現在のデータを置き換えます。</p>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-xs text-neutral-400">
            <th className="text-left font-normal" />
            <th className="text-right font-normal">現在</th>
            <th />
            <th className="text-right font-normal">復元後</th>
          </tr>
        </thead>
        <tbody>
          {row("タスク", current.tasks, next.tasks)}
          {row("固定予定", current.fixedEvents, next.fixedEvents)}
          {row("目標", current.goals, next.goals)}
          {row("工程", current.goalSteps, next.goalSteps)}
          {row("作業記録", current.workLogs, next.workLogs)}
        </tbody>
      </table>
      {pending.result.warning && <p className="mt-2 text-xs text-amber-700">{pending.result.warning}</p>}
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        置き換える前の現在のデータは、このブラウザ内に自動で退避されます（「自動退避データ」から戻せます）。
      </p>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        onClick={() => {
          const r = actions.replaceAll(pending.result.data, "復元する前のデータ（自動）");
          if (!r.ok) return setError(r.message);
          onDone("バックアップから復元しました");
        }}
        className="mt-4 h-12 w-full rounded-xl bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700"
      >
        復元する
      </button>
      <button type="button" onClick={onClose} className="mt-2 h-11 w-full rounded-xl text-sm text-neutral-600 active:bg-neutral-100">
        キャンセル
      </button>
    </Modal>
  );
}
