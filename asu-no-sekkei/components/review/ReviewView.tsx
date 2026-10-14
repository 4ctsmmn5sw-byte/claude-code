"use client";

import Link from "next/link";
import { useTokyoToday } from "@/hooks/useTokyoClock";
import { addDays, formatDateLabel } from "@/lib/date";
import { goalStats, minutesInRange } from "@/lib/goals";
import { useAppStore } from "@/lib/store";
import { formatDuration } from "@/lib/time";
import { AppNav } from "../AppNav";

/**
 * 振り返り（第1段階）。作業時間の実績を目標ごと・直近7日で集計する。
 * 計画と実績の比較などは後の段階で追加する。
 */
export function ReviewView() {
  const store = useAppStore();
  const today = useTokyoToday();
  if (!store || !today) return <div className="flex h-dvh items-center justify-center text-sm text-neutral-400">読み込み中…</div>;
  const { goals, goalSteps, workLogs, tasks } = store.data;
  const weekStart = addDays(today, -6);
  const week = minutesInRange(workLogs, weekStart, 7);
  const doneThisWeek = tasks.filter((t) => t.done && t.date && t.date >= weekStart && t.date <= today).length;
  const rows = goals
    .map((g) => ({ g, st: goalStats(g, goalSteps, workLogs, today), week: minutesInRange(workLogs.filter((l) => l.goalId === g.id), weekStart, 7) }))
    .filter((r) => r.st.actualMinutes > 0 || r.g.status === "active")
    .sort((a, b) => b.week - a.week);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const perDay = days.map((d) => workLogs.filter((l) => l.date === d).reduce((s, l) => s + l.minutes, 0));
  const maxDay = Math.max(60, ...perDay);

  return (
    <div className="mx-auto flex h-dvh max-w-[520px] flex-col bg-neutral-50 sm:border-x sm:border-neutral-200">
      <header className="z-30 shrink-0 border-b border-neutral-200/80 bg-white px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center">
          <h1 className="text-[17px] font-semibold text-neutral-900">振り返り</h1>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8">
        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80">
            <span className="text-xs text-neutral-500">直近7日の目標の作業時間</span>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-neutral-900" data-testid="week-minutes">
              {formatDuration(week)}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80">
            <span className="text-xs text-neutral-500">直近7日に完了したタスク</span>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-neutral-900">{doneThisWeek}件</p>
          </div>
        </section>

        <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-neutral-200/80" aria-label="日別の作業時間">
          <div className="flex h-28 items-end gap-2">
            {days.map((d, i) => (
              <div key={d} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-neutral-400">{perDay[i] > 0 ? Math.round((perDay[i] / 60) * 10) / 10 + "h" : ""}</span>
                <div className="w-full rounded-t-md bg-violet-500" style={{ height: `${(perDay[i] / maxDay) * 72}px` }} title={`${formatDateLabel(d)} ${formatDuration(perDay[i])}`} />
                <span className="text-[10px] text-neutral-500">{formatDateLabel(d).replace(/^\d+月/, "").replace(/日.*$/, "")}</span>
              </div>
            ))}
          </div>
        </section>

        <h2 className="mt-6 mb-2 text-[15px] font-semibold text-neutral-900">目標ごとの実績</h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-8 text-center text-sm leading-relaxed text-neutral-500">
            目標に紐づくタスクを完了すると、作業時間がここに集計されます。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map(({ g, st, week: w }) => (
              <li key={g.id}>
                <Link href={`/goals?id=${encodeURIComponent(g.id)}`} className="block rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80 active:bg-neutral-50">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] font-medium text-neutral-900">{g.title}</span>
                    {g.achievedAt && <span className="shrink-0 text-xs text-emerald-700">達成</span>}
                  </div>
                  <div className="mt-1 flex justify-between text-xs tabular-nums text-neutral-500">
                    <span>今週 {formatDuration(w)}</span>
                    <span>
                      累計 {formatDuration(st.actualMinutes)}
                      {st.estimatedMinutes !== null && ` / 想定 ${formatDuration(st.estimatedMinutes)}`}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-xs leading-relaxed text-neutral-400">計画と実績の比較や、AIによる振り返りの提案は今後の段階で追加します。</p>
      </main>
      <AppNav active="review" />
    </div>
  );
}
