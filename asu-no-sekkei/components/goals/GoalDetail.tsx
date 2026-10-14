"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ToastAction, ToastTone } from "@/hooks/useToast";
import { formatDateLabel } from "@/lib/date";
import {
  deadlineLabel,
  GOAL_STATUS_LABELS,
  goalStats,
  PRIORITY_LABELS,
  STEP_STATUS_LABELS,
  stepsOf,
  tasksOfStep,
  unfinishedDependencies,
} from "@/lib/goals";
import { actions } from "@/lib/store";
import { formatDuration, formatMinutes } from "@/lib/time";
import type { AppData, DateKey, Goal, GoalStep } from "@/lib/types";
import { GoalForm } from "./GoalForm";
import { StepForm } from "./StepForm";
import { WorkLogForm } from "./WorkLogForm";

type Notify = (message: string, tone?: ToastTone, action?: ToastAction) => void;

/**
 * 目標の詳細。工程（順序・必要時間・状態・前提）の管理、工程からタスクを作る操作、
 * 作業時間の実績と「達成したか」をそれぞれ別に扱う。
 */
export function GoalDetail({
  data,
  goal,
  today,
  categories,
  notify,
  onBack,
}: {
  data: AppData;
  goal: Goal;
  today: DateKey;
  categories: string[];
  notify: Notify;
  onBack: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [stepForm, setStepForm] = useState<GoalStep | "new" | null>(null);
  const [logging, setLogging] = useState(false);
  const steps = stepsOf(data.goalSteps, goal.id);
  const st = goalStats(goal, data.goalSteps, data.workLogs, today);
  const logs = data.workLogs.filter((l) => l.goalId === goal.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const stepTitle = new Map(steps.map((s) => [s.id, s.title]));
  const dl = deadlineLabel(st.daysLeft);
  const actualRatio = st.estimatedMinutes ? Math.min(1, st.actualMinutes / st.estimatedMinutes) : 0;

  const createTask = (step: GoalStep) => {
    const r = actions.createTaskFromStep(step.id);
    if (!r.ok) return notify(r.message, "error");
    notify(`「${step.title}」を未配置タスクに追加しました`, "info", { label: "計画を開く", run: () => router.push("/") });
  };

  return (
    <>
      <header className="z-30 shrink-0 border-b border-neutral-200/80 bg-white pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center justify-between px-1.5">
          <button type="button" onClick={onBack} className="flex h-11 items-center gap-1 rounded-full px-3 text-sm text-neutral-600 active:bg-neutral-100">
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            目標一覧
          </button>
          <button type="button" onClick={() => setEditing(true)} className="h-11 rounded-full px-4 text-sm font-medium text-neutral-700 active:bg-neutral-100">
            編集
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8" data-testid="goal-detail">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-white">{GOAL_STATUS_LABELS[goal.status]}</span>
          {goal.category && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">{goal.category}</span>}
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">優先度 {PRIORITY_LABELS[goal.priority]}</span>
          {goal.deadline && (
            <span className={`rounded-full px-2 py-0.5 ${st.daysLeft! < 0 ? "bg-rose-50 text-rose-700" : "bg-neutral-100 text-neutral-600"}`}>
              期限 {formatDateLabel(goal.deadline)}（{dl}）
            </span>
          )}
        </div>
        <h1 className="mt-2 text-xl font-semibold leading-snug text-neutral-900">{goal.title}</h1>
        {goal.description && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-600">{goal.description}</p>}
        {goal.successCriteria && (
          <div className="mt-3 rounded-2xl bg-white p-3 text-sm ring-1 ring-neutral-200/80">
            <span className="text-xs font-medium text-neutral-500">達成条件</span>
            <p className="mt-0.5 whitespace-pre-line leading-relaxed text-neutral-800">{goal.successCriteria}</p>
          </div>
        )}

        {goal.status === "wish" && (
          <button
            type="button"
            onClick={() => {
              actions.setGoalStatus(goal.id, "active");
              notify("取り組み中の目標にしました");
            }}
            className="mt-3 h-12 w-full rounded-2xl bg-neutral-900 text-[15px] font-semibold text-white active:bg-neutral-700"
          >
            この目標に取り組む
          </button>
        )}

        {/* 進捗（工程）と作業時間の実績 */}
        <section className="mt-4 grid grid-cols-2 gap-2" data-testid="goal-progress">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80">
            <span className="text-xs text-neutral-500">工程の進み</span>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900">
              {st.stepsDone}
              <span className="text-sm font-normal text-neutral-500"> / {st.stepsTotal} 完了</span>
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-neutral-900" style={{ width: `${st.stepsTotal ? Math.round((st.stepsDone / st.stepsTotal) * 100) : 0}%` }} />
            </div>
          </div>
          <div className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80">
            <span className="text-xs text-neutral-500">作業時間の実績</span>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900" data-testid="actual-minutes">
              {formatDuration(st.actualMinutes)}
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.round(actualRatio * 100)}%` }} />
            </div>
            <span className="mt-1 block text-[11px] text-neutral-400">
              {st.estimatedMinutes !== null ? `想定 ${formatDuration(st.estimatedMinutes)}` : "想定時間は未設定"}
            </span>
          </div>
        </section>
        {st.remainingStepMinutes > 0 && (
          <p className="mt-2 text-xs text-neutral-500">残りの工程の必要時間（目安）：{formatDuration(st.remainingStepMinutes)}</p>
        )}

        {/* 工程 */}
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold text-neutral-900">作業工程</h2>
            <span className="text-xs text-neutral-400">上から作業順</span>
          </div>
          {steps.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
              目標を進めるための工程を追加しましょう。
            </p>
          ) : (
            <ol className="flex flex-col gap-2" data-testid="step-list">
              {steps.map((s, i) => (
                <StepRow
                  key={s.id}
                  step={s}
                  index={i}
                  last={i === steps.length - 1}
                  data={data}
                  blockers={unfinishedDependencies(data.goalSteps, s)}
                  onOpen={() => setStepForm(s)}
                  onCreateTask={() => createTask(s)}
                />
              ))}
            </ol>
          )}
          <button
            type="button"
            onClick={() => setStepForm("new")}
            className="mt-2 h-12 w-full rounded-2xl bg-white text-[15px] font-medium text-neutral-800 ring-1 ring-neutral-200 active:bg-neutral-50"
          >
            ＋ 工程を追加
          </button>
        </section>

        {/* 実績 */}
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold text-neutral-900">作業時間の記録</h2>
            <span className="text-xs text-neutral-400">タスクの完了時に自動で記録</span>
          </div>
          {logs.length > 0 && (
            <ul className="divide-y divide-neutral-100 rounded-2xl bg-white ring-1 ring-neutral-200/80" data-testid="worklog-list">
              {logs.slice(0, 20).map((l) => (
                <li key={l.id} className="flex min-h-12 items-center gap-2 pl-4">
                  <span className="w-24 shrink-0 text-xs tabular-nums text-neutral-500">{formatDateLabel(l.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">
                    {(l.stepId && stepTitle.get(l.stepId)) || l.note || (l.taskId ? "タスク" : "作業")}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-neutral-700">{formatDuration(l.minutes)}</span>
                  <button
                    type="button"
                    onClick={() => actions.deleteWorkLog(l.id)}
                    className="grid size-11 shrink-0 place-items-center text-neutral-400 active:text-rose-600"
                    aria-label={`${formatDateLabel(l.date)}の記録を削除`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setLogging(true)}
            className="mt-2 h-12 w-full rounded-2xl bg-white text-[15px] font-medium text-neutral-800 ring-1 ring-neutral-200 active:bg-neutral-50"
          >
            ＋ 作業時間を記録
          </button>
        </section>

        {/* 達成（作業時間とは別に記録） */}
        <section className="mt-6 rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80" data-testid="achievement">
          <h2 className="text-[15px] font-semibold text-neutral-900">達成</h2>
          {goal.achievedAt ? (
            <>
              <p className="mt-1 text-sm text-emerald-700">🎉 {formatDateLabel(goal.achievedAt.slice(0, 10))}に達成しました</p>
              <button
                type="button"
                onClick={() => actions.setGoalAchieved(goal.id, false)}
                className="mt-2 h-11 w-full rounded-xl text-sm text-neutral-600 ring-1 ring-neutral-200 active:bg-neutral-50"
              >
                達成を取り消す
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                達成条件を満たしたら記録します。作業時間や工程の進みとは別に記録します。
              </p>
              <button
                type="button"
                onClick={() => {
                  actions.setGoalAchieved(goal.id, true);
                  notify("達成おめでとうございます！", "info", { label: "元に戻す", run: () => actions.setGoalAchieved(goal.id, false) });
                }}
                className="mt-2 h-12 w-full rounded-xl bg-emerald-600 text-[15px] font-semibold text-white active:bg-emerald-700"
              >
                目標を達成した
              </button>
            </>
          )}
        </section>

        <button
          type="button"
          onClick={() => {
            if (!window.confirm(`目標「${goal.title}」を削除しますか？\n工程と作業時間の記録も削除されます（作ったタスクは残ります）`)) return;
            const before = actions.deleteGoal(goal.id);
            onBack();
            notify("目標を削除しました", "info", { label: "元に戻す", run: () => actions.replaceAll(before, "目標の削除を取り消す前") });
          }}
          className="mt-4 h-11 w-full rounded-xl text-sm text-rose-600 active:bg-rose-50"
        >
          この目標を削除
        </button>
      </main>

      {editing && <GoalForm initial={goal} defaultStatus={goal.status} categories={categories} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      {stepForm && (
        <StepForm
          goalId={goal.id}
          initial={stepForm === "new" ? null : stepForm}
          siblings={steps}
          onClose={() => setStepForm(null)}
          onDelete={
            stepForm === "new"
              ? undefined
              : () => {
                  if (!window.confirm(`工程「${stepForm.title}」を削除しますか？（作ったタスクは残ります）`)) return;
                  actions.deleteStep(stepForm.id);
                  setStepForm(null);
                }
          }
        />
      )}
      {logging && <WorkLogForm goalId={goal.id} steps={steps} today={today} onClose={() => setLogging(false)} />}
    </>
  );
}

function StepRow({
  step,
  index,
  last,
  data,
  blockers,
  onOpen,
  onCreateTask,
}: {
  step: GoalStep;
  index: number;
  last: boolean;
  data: AppData;
  blockers: GoalStep[];
  onOpen: () => void;
  onCreateTask: () => void;
}) {
  const linked = tasksOfStep(data.tasks, step.id);
  const done = step.status === "done";
  const placed = linked.filter((t) => t.date && t.startMin !== null && !t.done);
  return (
    <li data-testid="step-row" data-step-status={step.status} className="rounded-2xl bg-white ring-1 ring-neutral-200/80">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => actions.setStepStatus(step.id, done ? "todo" : "done")}
          aria-label={done ? `${step.title}を未完了に戻す` : `${step.title}を完了にする`}
          aria-pressed={done}
          className="grid w-12 shrink-0 place-items-center"
        >
          <span className={`grid size-6 place-items-center rounded-full border-[1.5px] ${done ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}>
            {done && "✓"}
          </span>
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-3 pr-2 text-left" aria-label={`${step.title}を編集`}>
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            <span className="tabular-nums">{index + 1}</span>
            <span className={`rounded px-1 ${step.status === "doing" ? "bg-sky-50 text-sky-700" : step.status === "skipped" ? "bg-neutral-100 text-neutral-400" : ""}`}>
              {STEP_STATUS_LABELS[step.status]}
            </span>
            {step.estimatedMinutes !== null && <span className="tabular-nums">・{formatDuration(step.estimatedMinutes)}</span>}
          </span>
          <span className={`mt-0.5 block text-[15px] leading-snug ${done || step.status === "skipped" ? "text-neutral-400 line-through" : "text-neutral-900"}`}>
            {step.title}
          </span>
          {step.note && <span className="mt-0.5 block truncate text-xs text-neutral-500">{step.note}</span>}
          {blockers.length > 0 && !done && (
            <span className="mt-1 block text-xs text-amber-700">前提：{blockers.map((b) => `「${b.title}」`).join("")}が未完了</span>
          )}
          {linked.length > 0 && (
            <span className="mt-1 block text-xs text-violet-700" data-testid="step-tasks">
              タスク {linked.length}件
              {placed.length > 0 && `（${placed.map((t) => `${formatDateLabel(t.date!)} ${formatMinutes(t.startMin!)}`).join("、")}）`}
            </span>
          )}
        </button>
        <div className="flex shrink-0 flex-col justify-center pr-1">
          <button
            type="button"
            onClick={() => actions.moveStep(step.id, -1)}
            disabled={index === 0}
            className="grid size-11 place-items-center text-neutral-400 disabled:opacity-25"
            aria-label={`${step.title}を前へ`}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => actions.moveStep(step.id, 1)}
            disabled={last}
            className="grid size-11 place-items-center text-neutral-400 disabled:opacity-25"
            aria-label={`${step.title}を後ろへ`}
          >
            ▼
          </button>
        </div>
      </div>
      {!done && step.status !== "skipped" && (
        <div className="border-t border-neutral-100 px-2 py-1.5">
          <button
            type="button"
            onClick={onCreateTask}
            className="h-11 w-full rounded-xl text-sm font-medium text-violet-700 active:bg-violet-50"
            aria-label={`${step.title}をタスクにする`}
          >
            ＋ タスクにして計画へ
          </button>
        </div>
      )}
    </li>
  );
}
