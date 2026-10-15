"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useTokyoToday } from "@/hooks/useTokyoClock";
import { useToast } from "@/hooks/useToast";
import { deadlineLabel, goalStats, goalTab, PRIORITY_LABELS, sortGoals, type GoalTab } from "@/lib/goals";
import { useAppStore } from "@/lib/store";
import { formatDuration } from "@/lib/time";
import type { AppData, DateKey, Goal } from "@/lib/types";
import type { GoalInput } from "@/lib/store";
import { AppNav } from "../AppNav";
import { Toast } from "../Toast";
import { GoalDetail } from "./GoalDetail";
import { AiPlanSheet } from "./AiPlanSheet";
import { GoalForm } from "./GoalForm";

const TABS: { key: GoalTab; label: string }[] = [
  { key: "active", label: "取り組み中" },
  { key: "wish", label: "やりたいこと" },
  { key: "done", label: "達成・終了" },
];

export function GoalsView() {
  const store = useAppStore();
  const today = useTokyoToday();
  const goalId = useSearchParams().get("id");
  if (!store || !today) {
    return <div className="flex h-dvh items-center justify-center text-sm text-neutral-400">読み込み中…</div>;
  }
  return <GoalsContent data={store.data} today={today} goalId={goalId} />;
}

function GoalsContent({ data, today, goalId }: { data: AppData; today: DateKey; goalId: string | null }) {
  const router = useRouter();
  const { toast, show, hide } = useToast();
  const [tab, setTab] = useState<GoalTab>("active");
  const [adding, setAdding] = useState(false);
  const [aiInput, setAiInput] = useState<GoalInput | null>(null);
  const selected = goalId ? data.goals.find((g) => g.id === goalId) ?? null : null;
  const categories = useMemo(() => [...new Set(data.goals.map((g) => g.category).filter(Boolean))], [data.goals]);
  const counts = useMemo(() => {
    const c: Record<GoalTab, number> = { active: 0, wish: 0, done: 0 };
    for (const g of data.goals) c[goalTab(g)]++;
    return c;
  }, [data.goals]);
  const list = sortGoals(data.goals.filter((g) => goalTab(g) === tab));

  return (
    <div className="mx-auto flex h-dvh max-w-[520px] flex-col bg-neutral-50 sm:border-x sm:border-neutral-200">
      {selected ? (
        <GoalDetail data={data} goal={selected} today={today} categories={categories} notify={show} onBack={() => router.push("/goals")} />
      ) : (
        <>
          <header className="z-30 shrink-0 border-b border-neutral-200/80 bg-white px-4 pt-[env(safe-area-inset-top)]">
            <div className="flex h-12 items-center justify-between">
              <h1 className="text-[17px] font-semibold text-neutral-900">目標</h1>
              <Link href="/settings" className="flex h-11 items-center rounded-full px-3 text-sm text-neutral-500 active:bg-neutral-100">
                設定・バックアップ
              </Link>
            </div>
            <div className="-mx-1 flex gap-1 pb-2" role="tablist" aria-label="目標の区分">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`h-11 flex-1 rounded-full text-sm font-medium transition ${
                    tab === t.key ? "bg-neutral-900 text-white" : "text-neutral-600 active:bg-neutral-100"
                  }`}
                >
                  {t.label}
                  <span className={`ml-1 text-xs ${tab === t.key ? "text-white/70" : "text-neutral-400"}`}>{counts[t.key]}</span>
                </button>
              ))}
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
            {list.length === 0 ? (
              <EmptyState tab={tab} />
            ) : (
              <ul className="flex flex-col gap-2.5" data-testid="goal-list">
                {list.map((g) => (
                  <GoalCard key={g.id} goal={g} data={data} today={today} />
                ))}
              </ul>
            )}
            {tab !== "done" && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-4 h-12 w-full rounded-2xl bg-neutral-900 text-[15px] font-semibold text-white active:bg-neutral-700"
              >
                ＋ {tab === "wish" ? "やりたいことを追加" : "目標を追加"}
              </button>
            )}
          </main>
        </>
      )}

      <AppNav active="goals" />

      {adding && (
        <GoalForm
          initial={null}
          defaultStatus={tab === "wish" ? "wish" : "active"}
          categories={categories}
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            show("目標を追加しました。工程を追加しましょう");
            router.push(`/goals?id=${encodeURIComponent(id)}`);
          }}
          onAiPlan={(input) => {
            setAdding(false);
            setAiInput(input);
          }}
        />
      )}
      {aiInput && (
        <AiPlanSheet
          today={today}
          initialGoal={aiInput}
          onClose={() => setAiInput(null)}
          onSaved={(id, n) => {
            setAiInput(null);
            show(`AI の提案をもとに目標と${n}つの工程を保存しました`);
            router.push(`/goals?id=${encodeURIComponent(id)}`);
          }}
        />
      )}
      <Toast toast={toast} onClose={hide} />
    </div>
  );
}

function EmptyState({ tab }: { tab: GoalTab }) {
  const text =
    tab === "active"
      ? "取り組んでいる目標はまだありません。\n目標を追加して、工程に分けていきましょう。"
      : tab === "wish"
        ? "いつかやりたいことを気軽に書き留めておけます。\n取り組むと決めたら「取り組み中」に移せます。"
        : "達成した目標・やめた目標がここに並びます。";
  return (
    <p className="whitespace-pre-line rounded-3xl border border-dashed border-neutral-200 bg-white px-5 py-10 text-center text-sm leading-relaxed text-neutral-500">
      {text}
    </p>
  );
}

function GoalCard({ goal, data, today }: { goal: Goal; data: AppData; today: DateKey }) {
  const st = goalStats(goal, data.goalSteps, data.workLogs, today);
  const dl = deadlineLabel(st.daysLeft);
  const stepRatio = st.stepsTotal > 0 ? st.stepsDone / st.stepsTotal : 0;
  return (
    <li>
      <Link
        href={`/goals?id=${encodeURIComponent(goal.id)}`}
        data-testid="goal-card"
        className="block rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80 active:bg-neutral-50"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {goal.category && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">{goal.category}</span>}
              <span className={`rounded-full px-2 py-0.5 ${goal.priority === "high" ? "bg-rose-50 text-rose-700" : "bg-neutral-100 text-neutral-500"}`}>
                優先度 {PRIORITY_LABELS[goal.priority]}
              </span>
              {goal.status === "paused" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">一時停止</span>}
              {goal.achievedAt && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">達成</span>}
              {goal.status === "dropped" && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500">やめた</span>}
            </div>
            <h2 className="mt-1.5 text-[16px] font-semibold leading-snug text-neutral-900">{goal.title}</h2>
          </div>
          {dl && (
            <span className={`shrink-0 text-xs tabular-nums ${st.daysLeft !== null && st.daysLeft < 0 ? "text-rose-600" : "text-neutral-500"}`}>{dl}</span>
          )}
        </div>
        {st.stepsTotal > 0 && (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-neutral-900" style={{ width: `${Math.round(stepRatio * 100)}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs tabular-nums text-neutral-500">
              <span>
                工程 {st.stepsDone}/{st.stepsTotal}
              </span>
              <span>
                実績 {formatDuration(st.actualMinutes)}
                {st.estimatedMinutes !== null && ` / 想定 ${formatDuration(st.estimatedMinutes)}`}
              </span>
            </div>
          </div>
        )}
        {st.nextStep && <p className="mt-2 truncate text-xs text-neutral-500">次：{st.nextStep.title}</p>}
      </Link>
    </li>
  );
}
