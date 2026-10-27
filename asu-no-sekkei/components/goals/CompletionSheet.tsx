"use client";

import { useState } from "react";
import { useActionGuard } from "@/hooks/useActionGuard";
import { stepProgress } from "@/lib/sessions";
import { actions, useAppStore } from "@/lib/store";
import { formatDuration } from "@/lib/time";
import { Modal } from "../Modal";

/**
 * 目標のタスクを完了したときに開く「実績時間の確認」。
 * 完了した時点で予定時間を実績として記録済み（閉じてもそのまま残る）。ここでは実際に取り組んだ時間に直せる。
 * 予定時間（タスクの長さ）は変えない。工程を完了にするかもここで選べる（自動では完了にしない）。
 */
export function CompletionSheet({ taskId, onClose, onSaved }: { taskId: string; onClose: () => void; onSaved: (message: string) => void }) {
  const store = useAppStore();
  const data = store?.data;
  const task = data?.tasks.find((t) => t.id === taskId);
  const log = data?.workLogs.find((l) => l.taskId === taskId);
  const step = task?.stepId ? data?.goalSteps.find((s) => s.id === task.stepId) : undefined;
  const [minutes, setMinutes] = useState<number>(log?.minutes ?? task?.durationMin ?? 0);
  const [completeStep, setCompleteStep] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guard = useActionGuard(800);

  if (!data || !task || !log) return null;
  const valid = Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440;
  // 実績を直した後の見込み（今の記録分を差し替えて計算する）
  const before = step ? stepProgress(step, data.tasks, data.workLogs) : null;
  const after = step && before ? stepProgress(step, data.tasks, data.workLogs.map((l) => (l.id === log.id ? { ...l, minutes: valid ? minutes : 0 } : l))) : null;
  const reached = after?.remainingMinutes === 0;
  const doComplete = completeStep ?? !!reached;

  return (
    <Modal title="作業時間を記録" onClose={onClose} testId="completion-sheet">
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-neutral-50 p-3 text-sm">
          <p className="font-medium text-neutral-900">{task.title}</p>
          <p className="mt-0.5 text-xs text-neutral-500">予定 {formatDuration(task.durationMin)}（予定どおりの時間で記録済み）</p>
        </div>

        <div>
          <label htmlFor="actual-minutes" className="text-xs font-medium text-neutral-500">
            実際に取り組んだ時間
          </label>
          <div className="mt-1 flex items-center gap-1 text-sm text-neutral-600">
            <input
              id="actual-minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              value={Number.isFinite(minutes) ? minutes : ""}
              onChange={(e) => setMinutes(Math.round(Number(e.target.value)))}
              className="h-12 w-24 rounded-xl border border-neutral-200 px-2 text-right text-base tabular-nums"
            />
            分
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...new Set([task.durationMin, 30, 45, 60, 90])].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={`h-11 rounded-full px-3.5 text-sm ${minutes === m ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"}`}
              >
                {m === task.durationMin ? `予定どおり（${m}分）` : `${m}分`}
              </button>
            ))}
          </div>
        </div>

        {step && before && after && (
          <section className="rounded-2xl bg-white p-3 text-sm ring-1 ring-neutral-200/80" data-testid="completion-progress">
            <p className="text-xs font-medium text-neutral-500">工程「{step.title}」</p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums text-neutral-800">
              <dt className="text-neutral-500">実績</dt>
              <dd>
                {formatDuration(after.actualMinutes)}
                {after.estimatedMinutes !== null && ` / ${formatDuration(after.estimatedMinutes)}`}
              </dd>
              {after.remainingMinutes !== null && (
                <>
                  <dt className="text-neutral-500">残り必要時間</dt>
                  <dd>{formatDuration(after.remainingMinutes)}</dd>
                </>
              )}
              <dt className="text-neutral-500">予定済み</dt>
              <dd>{formatDuration(after.plannedMinutes)}</dd>
            </dl>
            {step.status !== "done" && step.status !== "skipped" && (
              <label className="mt-2 flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={doComplete} onChange={(e) => setCompleteStep(e.target.checked)} className="size-5" />
                工程も完了にする{reached ? "（必要時間に達しました）" : ""}
              </label>
            )}
          </section>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="button"
          disabled={!valid}
          onClick={() =>
            guard.run("save", () => {
              const r = actions.recordTaskActual(task.id, minutes, { completeStep: doComplete && !!step });
              if (!r.ok) return setError(r.message);
              onSaved(`実績を${formatDuration(minutes)}で記録しました${doComplete && step ? `。工程「${step.title}」を完了にしました` : ""}`);
            })
          }
          className="h-12 rounded-xl bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700 disabled:opacity-40"
        >
          記録する
        </button>
      </div>
    </Modal>
  );
}
