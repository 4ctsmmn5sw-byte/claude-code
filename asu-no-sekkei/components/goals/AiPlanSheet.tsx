"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAiStatus, loginAi, requestPlan } from "@/lib/ai/client";
import { capacityMinutes, checkCapacity } from "@/lib/ai/feasibility";
import { LIMITS, type AiQuestion, type AiResponse, type AiStatus, type Feasibility, type PlanErrorCode } from "@/lib/ai/planSchema";
import { PRIORITY_LABELS } from "@/lib/goals";
import { actions, type ApprovedStep, type GoalInput } from "@/lib/store";
import { formatDuration } from "@/lib/time";
import type { DateKey, GoalPriority } from "@/lib/types";
import { Modal } from "../Modal";
import { DateField } from "../WeeklyFields";
import { HoursInput, TextArea, TextField } from "./fields";
import { TomorrowPicker } from "./TomorrowPicker";

/**
 * 「AIに計画を作ってもらう」。
 * 1. 目標と状況を入力 → 2. AI が必要なら質問 → 3. 提案を編集 → 4. 承認したときだけ保存
 * AI に送るのは目標の文章と回答だけ。日付や使える時間の計算はこの画面で（AI を使わず）行う。
 */

type DraftStep = ApprovedStep & { originalMinutes: number };

type Phase =
  | { kind: "intake" }
  | { kind: "loading"; label: string }
  | { kind: "questions"; questions: AiQuestion[] }
  | { kind: "draft" }
  | { kind: "saved"; goalId: string; count: number };

const FEASIBILITY_LABEL: Record<Feasibility, { label: string; cls: string }> = {
  ok: { label: "期限までに完了できる見込み", cls: "bg-emerald-50 text-emerald-800" },
  tight: { label: "期限までにぎりぎり", cls: "bg-amber-50 text-amber-800" },
  unlikely: { label: "期限までの完了は難しい見込み", cls: "bg-rose-50 text-rose-800" },
  unknown: { label: "期限までの見込みは判断できません", cls: "bg-neutral-100 text-neutral-600" },
};

/** これ以上試しても解決しないエラー（再試行ボタンを出さない） */
const STOPPING: PlanErrorCode[] = ["daily_limit", "quota_exceeded", "not_configured", "bad_api_key", "model_unavailable"];

export function AiPlanSheet({
  today,
  initialGoal,
  existingGoal,
  onClose,
  onSaved,
}: {
  today: DateKey;
  /** 新しい目標を作る場合の入力（目標入力画面から） */
  initialGoal: GoalInput;
  /** 既存の目標に工程を足す場合 */
  existingGoal?: { id: string; stepTitles: string[] };
  onClose: () => void;
  onSaved: (goalId: string, stepCount: number) => void;
}) {
  const [goal, setGoal] = useState<GoalInput>(initialGoal);
  const [situation, setSituation] = useState("");
  const [weeklyMinutes, setWeeklyMinutes] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "intake" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ question: string; answer: string }[]>([]);
  const [rounds, setRounds] = useState(0);
  const [result, setResult] = useState<{ data: AiResponse; mock: boolean; model: string } | null>(null);
  const [draft, setDraft] = useState<DraftStep[]>([]);
  const [error, setError] = useState<{ code: PlanErrorCode | "save"; message: string } | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAiStatus().then((s) => {
      if (!alive) return;
      setStatus(s);
      setStatusLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const needsLogin = !!status && status.authRequired && !status.authenticated;
  const remaining = status ? Math.max(0, status.usage.limit - status.usage.used) : null;
  const blocked = !!status?.misconfigured || needsLogin || remaining === 0;

  const run = async (final: boolean, extra: { question: string; answer: string }[]) => {
    setError(null);
    const allAnswers = [...history, ...extra].slice(-LIMITS.answers);
    setPhase({ kind: "loading", label: final || rounds > 0 ? "AI が計画を作っています…" : "AI が目標を確認しています…" });
    const res = await requestPlan({
      goal: { title: goal.title, description: goal.description, successCriteria: goal.successCriteria, deadline: goal.deadline },
      situation,
      weeklyMinutes,
      answers: allAnswers,
      existingSteps: existingGoal?.stepTitles.slice(0, LIMITS.steps) ?? [],
      final,
      today,
    });
    if (res.usage && status) setStatus({ ...status, usage: res.usage });
    if (!res.ok) {
      setError({ code: res.code, message: res.message });
      if (res.code === "unauthenticated" && status) setStatus({ ...status, authenticated: false });
      setPhase(rounds > 0 && result?.data.ready === false ? { kind: "questions", questions: result.data.questions } : { kind: "intake" });
      return;
    }
    setHistory(allAnswers);
    setRounds((r) => r + 1);
    setResult({ data: res.data, mock: res.mock, model: res.model });
    if (!res.data.ready) {
      setAnswers({});
      setPhase({ kind: "questions", questions: res.data.questions });
      return;
    }
    setDraft(res.data.plan.steps.map((s) => ({ ...s, aiEstimated: true, originalMinutes: s.estimatedMinutes })));
    setPhase({ kind: "draft" });
  };

  const totalMinutes = draft.reduce((s, d) => s + (Number.isFinite(d.estimatedMinutes) ? d.estimatedMinutes : 0), 0);
  const capacity = capacityMinutes(today, goal.deadline, weeklyMinutes);
  const cap = checkCapacity(totalMinutes, capacity);

  const save = () => {
    const bad = draft.find((d) => !d.title.trim() || !Number.isInteger(d.estimatedMinutes) || d.estimatedMinutes < 1);
    if (bad) return setError({ code: "save", message: "工程名と必要時間（1分以上）を入力してください" });
    const r = actions.applyAiPlan({
      goalId: existingGoal?.id ?? null,
      goal: existingGoal ? null : goal,
      steps: draft.map((d) => ({ ...d, aiEstimated: d.estimatedMinutes === d.originalMinutes })),
    });
    if (!r.ok) return setError({ code: "save", message: r.message });
    setError(null);
    setPhase({ kind: "saved", goalId: r.goalId!, count: draft.length });
  };
  const close = () => (phase.kind === "saved" ? onSaved(phase.goalId, phase.count) : onClose());

  return (
    <Modal title={existingGoal ? "AIに工程を提案してもらう" : "AIに計画を作ってもらう"} onClose={close} testId="ai-plan-sheet">
      <ModeBadge status={status} loaded={statusLoaded} result={result} />

      {status?.misconfigured && (
        <p className="mb-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">
          {status.misconfigured}
        </p>
      )}

      {needsLogin && (
        <form
          className="mb-4 rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200/70"
          data-testid="ai-login"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await loginAi(passcode);
            if (!r.ok) return setLoginError(r.message ?? "確認できませんでした");
            setLoginError(null);
            setPasscode("");
            setStatus(await fetchAiStatus());
          }}
        >
          <label htmlFor="ai-passcode" className="text-xs font-medium text-neutral-500">
            AI 機能を使うにはパスコードを入力してください（本人確認）
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="ai-passcode"
              type="password"
              autoComplete="current-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="h-12 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-base outline-none focus:border-neutral-400"
            />
            <button type="submit" className="h-12 shrink-0 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white">
              確認
            </button>
          </div>
          {loginError && <p className="mt-1 text-sm text-rose-600">{loginError}</p>}
        </form>
      )}

      {error && (
        <div className="mb-3 rounded-2xl bg-rose-50 p-3 text-sm leading-relaxed text-rose-800" role="alert" data-testid="ai-error">
          {error.message}
        </div>
      )}

      {phase.kind === "intake" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!goal.title.trim()) return setError({ code: "invalid_request", message: "目標名を入力してください" });
            run(false, []);
          }}
        >
          {existingGoal ? (
            <div className="rounded-2xl bg-neutral-50 p-3 text-sm">
              <span className="text-xs text-neutral-500">目標</span>
              <p className="font-medium text-neutral-900">{goal.title}</p>
              {existingGoal.stepTitles.length > 0 && (
                <p className="mt-1 text-xs text-neutral-500">登録済みの工程 {existingGoal.stepTitles.length}件と重ならないよう提案します</p>
              )}
            </div>
          ) : (
            <>
              <TextField id="ai-title" label="目標名" value={goal.title} onChange={(v) => setGoal({ ...goal, title: v })} maxLength={LIMITS.title} />
              <TextArea id="ai-desc" label="説明（任意）" value={goal.description} onChange={(v) => setGoal({ ...goal, description: v.slice(0, LIMITS.description) })} />
              <TextArea
                id="ai-criteria"
                label="達成条件（任意）"
                value={goal.successCriteria}
                onChange={(v) => setGoal({ ...goal, successCriteria: v.slice(0, LIMITS.successCriteria) })}
              />
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <DateField id="ai-deadline" label="達成期限（任意）" value={goal.deadline} onChange={(v) => setGoal({ ...goal, deadline: v })} emptyLabel="期限なし" />
            <HoursInput id="ai-weekly" label="1週間に使える時間（任意）" minutes={weeklyMinutes} onChange={setWeeklyMinutes} />
          </div>
          <TextArea id="ai-situation" label="今の状況・進み具合（任意）" value={situation} onChange={(v) => setSituation(v.slice(0, LIMITS.situation))} placeholder="例：今は650点。単語は少しずつ覚えている" />
          <p className="text-xs leading-relaxed text-neutral-500">
            AI に送るのは、上の目標の内容と入力した回答だけです。時間割・タスク・カレンダーの予定や個人を特定する情報は送りません。
            個人情報は入力しないでください。
          </p>
          <button
            type="submit"
            disabled={blocked || !statusLoaded}
            className="h-12 rounded-xl bg-violet-600 text-base font-semibold text-white active:bg-violet-700 disabled:opacity-40"
          >
            ✨ AIに相談する
            {remaining !== null && <span className="ml-1 text-sm font-normal opacity-80">（今日あと{remaining}回）</span>}
          </button>
        </form>
      )}

      {phase.kind === "loading" && (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-neutral-500" aria-busy="true" data-testid="ai-loading">
          <span className="size-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
          {phase.label}
        </div>
      )}

      {phase.kind === "questions" && (
        <form
          className="flex flex-col gap-4"
          data-testid="ai-questions"
          onSubmit={(e) => {
            e.preventDefault();
            const qa = phase.questions
              .map((q) => ({ question: q.question.slice(0, LIMITS.question), answer: (answers[q.id] ?? "").trim().slice(0, LIMITS.answer) }))
              .filter((x) => x.answer);
            run(true, qa);
          }}
        >
          <p className="text-sm text-neutral-700">計画を作る前に、AI からの質問です（わからなければ空欄で構いません）。</p>
          {phase.questions.map((q, i) => (
            <div key={q.id} className="rounded-2xl bg-neutral-50 p-3">
              <label htmlFor={`ai-q-${i}`} className="block text-[15px] font-medium text-neutral-900">
                {q.question}
              </label>
              {q.why && <p className="mt-0.5 text-xs text-neutral-500">{q.why}</p>}
              {q.options.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                      className={`min-h-11 rounded-full px-3.5 text-sm ${answers[q.id] === o ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 ring-1 ring-neutral-200"}`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
              <input
                id={`ai-q-${i}`}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value.slice(0, LIMITS.answer) }))}
                placeholder="回答を入力"
                className="mt-2 h-12 w-full rounded-xl border border-neutral-200 bg-white px-3 text-base outline-none focus:border-neutral-400"
              />
            </div>
          ))}
          <button type="submit" disabled={blocked} className="h-12 rounded-xl bg-violet-600 text-base font-semibold text-white active:bg-violet-700 disabled:opacity-40">
            回答して計画を作る
            {remaining !== null && <span className="ml-1 text-sm font-normal opacity-80">（今日あと{remaining}回）</span>}
          </button>
        </form>
      )}

      {phase.kind === "draft" && result && (
        <DraftEditor
          result={result.data}
          draft={draft}
          setDraft={setDraft}
          totalMinutes={totalMinutes}
          cap={cap}
          hasDeadline={!!goal.deadline}
          hasWeekly={weeklyMinutes !== null}
          onSave={save}
          onDiscard={() => {
            if (window.confirm("提案を保存せずに閉じますか？")) onClose();
          }}
        />
      )}

      {phase.kind === "saved" && (
        <div className="flex flex-col gap-3" data-testid="ai-saved">
          <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{phase.count}つの工程を目標に保存しました。</p>
          <TomorrowPicker goalId={phase.goalId} today={today} onDone={() => onSaved(phase.goalId, phase.count)} />
          <button type="button" onClick={close} className="h-11 rounded-xl text-sm text-neutral-600 active:bg-neutral-100">
            あとで（目標を開く）
          </button>
        </div>
      )}

      {error && phase.kind === "intake" && !STOPPING.includes(error.code as PlanErrorCode) && rounds > 0 && (
        <p className="mt-2 text-xs text-neutral-500">入力を確認して、もう一度「AIに相談する」を押してください。</p>
      )}
    </Modal>
  );
}

function ModeBadge({ status, loaded, result }: { status: AiStatus | null; loaded: boolean; result: { mock: boolean; model: string } | null }) {
  if (!loaded) return null;
  if (!status) {
    return <p className="mb-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">AI 機能の状態を取得できませんでした。通信状態を確認してください。</p>;
  }
  const mock = result ? result.mock : status.mock;
  return (
    <p className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500" data-testid="ai-mode">
      {mock ? (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">仮データ（API キー未設定）</span>
      ) : (
        <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-800">Gemini（{result?.model ?? status.model}・無料枠）</span>
      )}
      <span>今日の利用 {status.usage.used}/{status.usage.limit}回</span>
    </p>
  );
}

function DraftEditor({
  result,
  draft,
  setDraft,
  totalMinutes,
  cap,
  hasDeadline,
  hasWeekly,
  onSave,
  onDiscard,
}: {
  result: AiResponse;
  draft: DraftStep[];
  setDraft: (fn: (d: DraftStep[]) => DraftStep[]) => void;
  totalMinutes: number;
  cap: ReturnType<typeof checkCapacity>;
  hasDeadline: boolean;
  hasWeekly: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const f = FEASIBILITY_LABEL[result.plan.feasibility.status];
  const update = (key: string, patch: Partial<DraftStep>) => setDraft((d) => d.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  // 削除した工程を前提にしていた工程は、その工程の前提を引き継ぐ（順番の関係を保つ）
  const remove = (key: string) =>
    setDraft((d) => {
      const inherited = d.find((s) => s.key === key)?.dependsOn ?? [];
      return d
        .filter((s) => s.key !== key)
        .map((s) => (s.dependsOn.includes(key) ? { ...s, dependsOn: [...new Set([...s.dependsOn.filter((x) => x !== key), ...inherited])] } : s));
    });
  const titleOf = useMemo(() => new Map(draft.map((s) => [s.key, s.title])), [draft]);
  let nextKey = draft.length + 1;
  while (draft.some((s) => s.key === `u${nextKey}`)) nextKey++;

  return (
    <div className="flex flex-col gap-4" data-testid="ai-draft">
      <section className="rounded-2xl bg-neutral-50 p-3 text-sm leading-relaxed">
        {result.plan.summary && <p className="text-neutral-800">{result.plan.summary}</p>}
        {result.plan.approach && (
          <p className="mt-2 text-neutral-600">
            <span className="text-xs font-medium text-neutral-500">進め方：</span>
            {result.plan.approach}
          </p>
        )}
      </section>

      <section className={`rounded-2xl p-3 text-sm ${f.cls}`} data-testid="ai-feasibility">
        <p className="font-semibold">AI の見立て：{f.label}</p>
        {result.plan.feasibility.reason && <p className="mt-1 leading-relaxed">{result.plan.feasibility.reason}</p>}
      </section>

      <section className="rounded-2xl bg-white p-3 text-sm ring-1 ring-neutral-200/80" data-testid="capacity-check">
        <p className="text-xs font-medium text-neutral-500">アプリによる計算（AI を使わない）</p>
        <p className="mt-1 tabular-nums text-neutral-800">
          必要時間の合計（推定）：<b>{formatDuration(totalMinutes)}</b>
        </p>
        {cap.capacityMinutes !== null ? (
          <>
            <p className="tabular-nums text-neutral-800">期限までに使える時間：{formatDuration(cap.capacityMinutes)}</p>
            <p className={`mt-1 font-semibold ${cap.status === "short" ? "text-rose-700" : cap.status === "tight" ? "text-amber-700" : "text-emerald-700"}`}>
              {cap.status === "short"
                ? `期限までに約${formatDuration(cap.shortageMinutes)}不足します。工程を減らすか、期限・使える時間を見直してください`
                : cap.status === "tight"
                  ? "期限までに間に合いますが、余裕はあまりありません"
                  : "期限までの時間に収まります"}
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">
            {!hasDeadline ? "期限" : ""}
            {!hasDeadline && !hasWeekly ? "と" : ""}
            {!hasWeekly ? "1週間に使える時間" : ""}を入力すると、期限までに間に合うかを計算します。
          </p>
        )}
      </section>

      <p className="text-xs leading-relaxed text-amber-800">⚠︎ 必要時間は AI による推定値です。自分のペースに合わせて調整してください。</p>

      <ol className="flex flex-col gap-2">
        {draft.map((s, i) => (
          <li key={s.key} className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200" data-testid="ai-step">
            <div className="flex items-start gap-2">
              <span className="mt-3 w-5 shrink-0 text-center text-xs tabular-nums text-neutral-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <input
                  aria-label={`工程${i + 1}の名前`}
                  value={s.title}
                  onChange={(e) => update(s.key, { title: e.target.value.slice(0, LIMITS.stepTitle) })}
                  className="h-11 w-full rounded-lg border border-neutral-200 px-3 text-[15px] font-medium outline-none focus:border-neutral-400"
                />
                <textarea
                  aria-label={`工程${i + 1}の具体的な作業`}
                  value={s.detail}
                  onChange={(e) => update(s.key, { detail: e.target.value.slice(0, LIMITS.stepDetail) })}
                  rows={2}
                  className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm leading-relaxed text-neutral-700 outline-none focus:border-neutral-400"
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-neutral-500">
                    <input
                      aria-label={`工程${i + 1}の必要時間（分）`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={LIMITS.stepMaxMinutes}
                      value={Number.isFinite(s.estimatedMinutes) ? s.estimatedMinutes : ""}
                      onChange={(e) => update(s.key, { estimatedMinutes: e.target.value === "" ? NaN : Math.round(Number(e.target.value)) })}
                      className="h-11 w-20 rounded-lg border border-neutral-200 px-2 text-right text-base tabular-nums outline-none focus:border-neutral-400"
                    />
                    分
                    {s.estimatedMinutes === s.originalMinutes && <span className="rounded bg-amber-50 px-1 text-[11px] text-amber-800">AI推定</span>}
                  </label>
                  <div className="flex" role="radiogroup" aria-label={`工程${i + 1}の優先度`}>
                    {(["high", "medium", "low"] as GoalPriority[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={s.priority === p}
                        onClick={() => update(s.key, { priority: p })}
                        className={`h-11 w-11 text-xs first:rounded-l-lg last:rounded-r-lg ${s.priority === p ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}
                      >
                        {PRIORITY_LABELS[p]}
                      </button>
                    ))}
                  </div>
                </div>
                {i > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-neutral-400">前提：</span>
                    {draft.slice(0, i).map((p) => {
                      const on = s.dependsOn.includes(p.key);
                      return (
                        <button
                          key={p.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => update(s.key, { dependsOn: on ? s.dependsOn.filter((x) => x !== p.key) : [...s.dependsOn, p.key] })}
                          className={`min-h-9 max-w-[12rem] truncate rounded-full px-2.5 text-[11px] ${on ? "bg-violet-600 text-white" : "bg-neutral-100 text-neutral-500"}`}
                        >
                          {titleOf.get(p.key) || "（無題）"}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid size-11 place-items-center text-neutral-400 disabled:opacity-25" aria-label={`工程${i + 1}を前へ`}>
                  ▲
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === draft.length - 1} className="grid size-11 place-items-center text-neutral-400 disabled:opacity-25" aria-label={`工程${i + 1}を後ろへ`}>
                  ▼
                </button>
                <button type="button" onClick={() => remove(s.key)} className="grid size-11 place-items-center text-neutral-400 active:text-rose-600" aria-label={`工程${i + 1}を削除`}>
                  ✕
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => setDraft((d) => [...d, { key: `u${nextKey}`, title: "", detail: "", estimatedMinutes: 30, priority: "medium", dependsOn: [], aiEstimated: false, originalMinutes: -1 }])}
        className="h-11 rounded-xl text-sm text-neutral-700 ring-1 ring-neutral-200 active:bg-neutral-50"
      >
        ＋ 工程を追加
      </button>

      <button type="button" onClick={onSave} disabled={draft.length === 0} className="h-12 rounded-xl bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700 disabled:opacity-40">
        この内容で保存する（{draft.length}工程）
      </button>
      <button type="button" onClick={onDiscard} className="h-11 rounded-xl text-sm text-neutral-600 active:bg-neutral-100">
        保存せずに閉じる
      </button>
    </div>
  );
}
