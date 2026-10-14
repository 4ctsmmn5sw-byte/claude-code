"use client";

import Link from "next/link";
import { useState } from "react";
import { addDays, formatDateLabel } from "@/lib/date";
import { stepsOf, unfinishedDependencies } from "@/lib/goals";
import { DEFAULT_SLOT_OPTIONS } from "@/lib/slots";
import { actions, useAppStore } from "@/lib/store";
import { formatDuration, formatMinutes } from "@/lib/time";
import type { DateKey, GoalStep } from "@/lib/types";

/** 1 回のタスクの長さの初期値の上限（長い工程は分けて取り組む前提） */
const DEFAULT_CHUNK = 60;

/**
 * 保存した工程を明日の時間割に追加する。
 * 空き時間はアプリが計算し（固定予定・配置済みタスクと重ならない最も早い時刻）、AI は使わない。
 * 空きがない工程は無理に詰め込まず、未配置のタスクとして残す。
 */
export function TomorrowPicker({ goalId, today, onDone }: { goalId: string; today: DateKey; onDone?: () => void }) {
  const store = useAppStore();
  const tomorrow = addDays(today, 1);
  const allSteps = store?.data.goalSteps ?? [];
  const steps = stepsOf(allSteps, goalId).filter((s) => s.status === "todo" || s.status === "doing");
  // 前提が済んでいる工程を最大2つ、最初から選んでおく
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    steps.filter((s) => unfinishedDependencies(allSteps, s).length === 0).slice(0, 2).forEach((s) => (init[s.id] = true));
    return init;
  });
  const [minutes, setMinutes] = useState<Record<string, number>>(() =>
    Object.fromEntries(steps.map((s) => [s.id, Math.min(s.estimatedMinutes ?? 30, DEFAULT_CHUNK)])),
  );
  const [results, setResults] = useState<{ title: string; startMin: number | null; minutes: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!store) return null;

  if (results) {
    const placed = results.filter((r) => r.startMin !== null);
    return (
      <div className="flex flex-col gap-3" data-testid="tomorrow-result">
        <p className="text-sm font-semibold text-neutral-900">{formatDateLabel(tomorrow)}の時間割に追加しました</p>
        <ul className="flex flex-col gap-1.5">
          {results.map((r, i) => (
            <li key={i} className="rounded-xl bg-neutral-50 px-3 py-2 text-sm">
              <span className="font-medium text-neutral-900">{r.title}</span>
              <span className={`ml-2 text-xs tabular-nums ${r.startMin === null ? "text-amber-700" : "text-neutral-500"}`}>
                {r.startMin === null
                  ? "空き時間が足りないため未配置（計画画面で配置してください）"
                  : `${formatMinutes(r.startMin)}–${formatMinutes(r.startMin + r.minutes)}`}
              </span>
            </li>
          ))}
        </ul>
        {placed.length < results.length && (
          <p className="text-xs text-amber-800">明日の空き時間に収まらなかった作業は、未配置タスクとして残しています（自動では詰め込みません）。</p>
        )}
        <Link href="/" className="grid h-12 place-items-center rounded-xl bg-neutral-900 text-base font-semibold text-white" onClick={onDone}>
          明日の計画を開く
        </Link>
      </div>
    );
  }

  const chosen = steps.filter((s) => selected[s.id]);
  return (
    <div className="flex flex-col gap-3" data-testid="tomorrow-picker">
      <p className="text-sm text-neutral-700">
        {formatDateLabel(tomorrow)}の空き時間（{formatMinutes(DEFAULT_SLOT_OPTIONS.from)}〜{formatMinutes(DEFAULT_SLOT_OPTIONS.to)}、固定予定・既存のタスクと重ならない時間）に追加します。
      </p>
      {steps.length === 0 ? (
        <p className="rounded-xl bg-neutral-50 p-4 text-center text-sm text-neutral-500">追加できる工程がありません</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {steps.map((s) => (
            <StepChoice
              key={s.id}
              step={s}
              blockers={unfinishedDependencies(allSteps, s).map((b) => b.title)}
              on={!!selected[s.id]}
              minutes={minutes[s.id]}
              onToggle={() => setSelected((x) => ({ ...x, [s.id]: !x[s.id] }))}
              onMinutes={(v) => setMinutes((x) => ({ ...x, [s.id]: v }))}
            />
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        disabled={chosen.length === 0}
        onClick={() => {
          const bad = chosen.find((s) => !Number.isInteger(minutes[s.id]) || minutes[s.id] < 5 || minutes[s.id] > 600);
          if (bad) return setError("1回の作業時間は5〜600分で入力してください");
          setResults(
            chosen.map((s) => {
              const r = actions.addStepToDay(s.id, tomorrow, minutes[s.id]);
              return { title: s.title, startMin: r.ok ? (r.startMin ?? null) : null, minutes: minutes[s.id] };
            }),
          );
        }}
        className="h-12 rounded-xl bg-neutral-900 text-base font-semibold text-white disabled:opacity-40"
      >
        明日の時間割に追加（{chosen.length}件）
      </button>
    </div>
  );
}

function StepChoice({
  step,
  blockers,
  on,
  minutes,
  onToggle,
  onMinutes,
}: {
  step: GoalStep;
  blockers: string[];
  on: boolean;
  minutes: number;
  onToggle: () => void;
  onMinutes: (v: number) => void;
}) {
  return (
    <li className={`rounded-xl p-2 ring-1 ${on ? "bg-white ring-neutral-900" : "bg-neutral-50 ring-neutral-200"}`} data-testid="tomorrow-step">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onToggle} aria-pressed={on} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-label={`${step.title}を明日に追加`}>
          <span className={`grid size-6 shrink-0 place-items-center rounded-md border text-xs ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}>{on ? "✓" : ""}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-neutral-900">{step.title}</span>
            <span className="block text-[11px] text-neutral-500">
              {step.estimatedMinutes !== null && `全体 ${formatDuration(step.estimatedMinutes)}${step.aiEstimated ? "（AI推定）" : ""}`}
              {blockers.length > 0 && <span className="ml-1 text-amber-700">前提「{blockers.join("」「")}」が未完了</span>}
            </span>
          </span>
        </button>
        <label className="flex shrink-0 items-center gap-1 text-xs text-neutral-500">
          <input
            type="number"
            inputMode="numeric"
            min={5}
            max={600}
            aria-label={`${step.title}の明日の作業時間（分）`}
            value={Number.isFinite(minutes) ? minutes : ""}
            onChange={(e) => onMinutes(Math.round(Number(e.target.value)))}
            className="h-11 w-16 rounded-lg border border-neutral-200 px-2 text-right text-base tabular-nums"
          />
          分
        </label>
      </div>
    </li>
  );
}
