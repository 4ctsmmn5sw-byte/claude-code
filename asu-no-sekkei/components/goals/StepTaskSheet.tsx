"use client";

import { useMemo, useState } from "react";
import { useActionGuard } from "@/hooks/useActionGuard";
import { addDays, formatDateLabel } from "@/lib/date";
import { unfinishedDependencies } from "@/lib/goals";
import {
  DEFAULT_SESSION_MINUTES,
  latestPrerequisiteDate,
  proposeSessions,
  SESSION_CHOICES,
  splitSessions,
  stepProgress,
  type SessionCandidate,
} from "@/lib/sessions";
import { findFreeSlot } from "@/lib/slots";
import { actions, type StepTaskItem } from "@/lib/store";
import { formatDuration, formatMinutes } from "@/lib/time";
import type { AppData, DateKey, GoalStep } from "@/lib/types";
import { Modal } from "../Modal";
import { DateField } from "../WeeklyFields";
import { HoursInput, Segmented } from "./fields";

type Mode = "single" | "split";
type Placement = "unplaced" | "day";

/**
 * 「タスクにして計画へ」。工程の総必要時間ではなく、1 回の作業時間でタスクを作る。
 * - 1 回分：未配置で保存するか、指定した日の空き時間に配置する
 * - まとめて分割：残りの時間を 1 回分ずつに分け、1 日 1 回ずつ空き時間に入れた候補を表示。作成を押すまで保存しない
 * 予定が残り必要時間を超えるときは警告し、「追加練習として予定する」を選んだときだけ作成できる。
 */
export function StepTaskSheet({
  data,
  step,
  today,
  onClose,
  onCreated,
}: {
  data: AppData;
  step: GoalStep;
  today: DateKey;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const progress = stepProgress(step, data.tasks, data.workLogs);
  const tomorrow = addDays(today, 1);
  const prereqDate = latestPrerequisiteDate(step, data.tasks);
  const blockers = unfinishedDependencies(data.goalSteps, step);
  const firstDay = prereqDate && prereqDate >= tomorrow ? addDays(prereqDate, 1) : tomorrow;

  // 初期値：工程に覚えた 1 回の作業時間（なければ 60 分）。未予定の残りが短ければ残りの時間まで
  const preferred = step.sessionMinutes ?? DEFAULT_SESSION_MINUTES;
  const initialSession = progress.unplannedMinutes !== null && progress.unplannedMinutes > 0 ? Math.min(preferred, progress.unplannedMinutes) : preferred;
  const [session, setSession] = useState<number>(initialSession);
  const [custom, setCustom] = useState(!(SESSION_CHOICES as readonly number[]).includes(initialSession));
  const [mode, setMode] = useState<Mode>("single");
  const [placement, setPlacement] = useState<Placement>("unplaced");
  const [date, setDate] = useState<DateKey | null>(firstDay);
  const [splitTotal, setSplitTotal] = useState<number | null>(progress.unplannedMinutes && progress.unplannedMinutes > 0 ? progress.unplannedMinutes : null);
  const [startDate, setStartDate] = useState<DateKey | null>(firstDay);
  const [adapt, setAdapt] = useState(false);
  const [removed, setRemoved] = useState<Set<number>>(() => new Set());
  const [extra, setExtra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useActionGuard(1500);

  const sessionValid = Number.isInteger(session) && session >= 5 && session <= 600;

  // 1 回分：指定した日に配置する場合の空き時間
  const singleSlot = useMemo(() => {
    if (mode !== "single" || placement !== "day" || !date || !sessionValid) return null;
    return findFreeSlot(data.tasks, data.fixedEvents, date, "__new__", session);
  }, [mode, placement, date, session, sessionValid, data.tasks, data.fixedEvents]);

  // まとめて分割：候補（保存はしない）
  const proposal = useMemo(() => {
    if (mode !== "split" || !sessionValid || !splitTotal || !startDate) return null;
    return proposeSessions({ tasks: data.tasks, events: data.fixedEvents, startDate, sessions: splitSessions(splitTotal, session), adapt });
  }, [mode, sessionValid, splitTotal, startDate, session, adapt, data.tasks, data.fixedEvents]);
  const candidates: SessionCandidate[] = proposal ? proposal.candidates.filter((_, i) => !removed.has(i)) : [];

  const newMinutes = mode === "single" ? (sessionValid ? session : 0) : candidates.reduce((s, c) => s + c.durationMin, 0);
  const overBy = progress.remainingMinutes === null ? 0 : progress.plannedMinutes + newMinutes - progress.remainingMinutes;
  const needsExtra = overBy > 0;
  const canCreate = sessionValid && (mode === "single" ? placement === "unplaced" || !!date : candidates.length > 0) && (!needsExtra || extra);

  const create = () =>
    guard.run("create", () => {
      setError(null);
      let items: StepTaskItem[];
      if (mode === "single") {
        items = [{ durationMin: session, date: placement === "day" && singleSlot !== null ? date : null, startMin: placement === "day" ? singleSlot : null }];
      } else {
        items = candidates.map((c) => ({ durationMin: c.durationMin, date: c.date, startMin: c.startMin }));
      }
      const r = actions.createStepTasks(step.id, items, { sessionMinutes: session });
      if (!r.ok) return setError(r.message);
      const placedCount = items.filter((i) => i.startMin !== null).length;
      onCreated(
        mode === "single"
          ? placedCount > 0
            ? `「${step.title}」を${formatDateLabel(date!)} ${formatMinutes(singleSlot!)}から${formatDuration(session)}で配置しました`
            : placement === "day"
              ? `空き時間がなかったため、「${step.title}」（${formatDuration(session)}）を未配置で追加しました`
              : `「${step.title}」（${formatDuration(session)}）を未配置タスクに追加しました`
          : `「${step.title}」を${items.length}回に分けて配置しました`,
      );
    });

  return (
    <Modal title="タスクにして計画へ" onClose={onClose} testId="step-task-sheet">
      <div className="flex flex-col gap-4">
        <section className="rounded-2xl bg-neutral-50 p-3 text-sm" data-testid="step-progress">
          <p className="font-medium text-neutral-900">{step.title}</p>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums text-neutral-700">
            <dt className="text-neutral-500">総必要時間</dt>
            <dd>{progress.estimatedMinutes !== null ? `${formatDuration(progress.estimatedMinutes)}（推定）` : "未設定"}</dd>
            <dt className="text-neutral-500">実績</dt>
            <dd>{formatDuration(progress.actualMinutes)}</dd>
            {progress.remainingMinutes !== null && (
              <>
                <dt className="text-neutral-500">残り</dt>
                <dd>{formatDuration(progress.remainingMinutes)}</dd>
              </>
            )}
            <dt className="text-neutral-500">予定済み</dt>
            <dd>
              {formatDuration(progress.plannedMinutes)}
              <span className="text-xs text-neutral-500">（未完了のタスク）</span>
            </dd>
            {progress.unplannedMinutes !== null && (
              <>
                <dt className="text-neutral-500">未予定</dt>
                <dd data-testid="unplanned">{formatDuration(progress.unplannedMinutes)}</dd>
              </>
            )}
          </dl>
        </section>

        {blockers.length > 0 && (
          <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            前提の工程「{blockers.map((b) => b.title).join("」「")}」が未完了です。
            {prereqDate && `前提のタスクが${formatDateLabel(prereqDate)}まで入っているため、その翌日以降を初期値にしています。`}
          </p>
        )}

        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-500">1回の作業時間</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="1回の作業時間">
            {SESSION_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={!custom && session === c}
                onClick={() => {
                  setCustom(false);
                  setSession(c);
                  setRemoved(new Set());
                }}
                className={`h-11 min-w-14 rounded-full px-3.5 text-sm ${!custom && session === c ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"}`}
              >
                {c}分
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={custom}
              onClick={() => setCustom(true)}
              className={`h-11 rounded-full px-3.5 text-sm ${custom ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"}`}
            >
              自由入力
            </button>
          </div>
          {custom && (
            <label className="mt-2 flex items-center gap-1 text-sm text-neutral-600">
              <input
                type="number"
                inputMode="numeric"
                min={5}
                max={600}
                aria-label="1回の作業時間（分）"
                value={Number.isFinite(session) ? session : ""}
                onChange={(e) => {
                  setSession(Math.round(Number(e.target.value)));
                  setRemoved(new Set());
                }}
                className="h-11 w-24 rounded-xl border border-neutral-200 px-2 text-right text-base tabular-nums"
              />
              分（5〜600分）
            </label>
          )}
          <p className="mt-1 text-[11px] text-neutral-500">タスクにはこの時間だけを設定します。工程全体の必要時間は変わりません。</p>
        </div>

        <Segmented
          label="作り方"
          value={mode}
          onChange={(v) => {
            setMode(v as Mode);
            setExtra(false);
          }}
          options={[
            { value: "single", label: "1回分" },
            { value: "split", label: "まとめて分割" },
          ]}
        />

        {mode === "single" ? (
          <div className="flex flex-col gap-3">
            <Segmented
              label="置き場所"
              value={placement}
              onChange={(v) => setPlacement(v as Placement)}
              options={[
                { value: "unplaced", label: "未配置で保存" },
                { value: "day", label: "日付を指定して配置" },
              ]}
            />
            {placement === "day" && (
              <>
                <DateField id="step-task-date" label="配置する日" value={date} onChange={setDate} clearable={false} emptyLabel="選んでください" />
                {date && sessionValid && (
                  <p className="text-xs text-neutral-600" data-testid="single-slot">
                    {singleSlot !== null
                      ? `${formatDateLabel(date)} ${formatMinutes(singleSlot)}–${formatMinutes(singleSlot + session)} の空き時間に入れます`
                      : "この日は空き時間が足りません。作成すると未配置で保存します"}
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3" data-testid="split-panel">
            <div className="grid grid-cols-2 gap-3">
              <HoursInput
                id="split-total"
                label="分ける時間（合計）"
                minutes={splitTotal}
                onChange={(v) => {
                  setSplitTotal(v);
                  setRemoved(new Set());
                }}
              />
              <DateField
                id="split-start"
                label="開始日"
                value={startDate}
                onChange={(v) => {
                  setStartDate(v);
                  setRemoved(new Set());
                }}
                clearable={false}
                emptyLabel="選んでください"
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={adapt} onChange={(e) => setAdapt(e.target.checked)} className="size-5" />
              空きが足りない日は45分・30分に短くする
            </label>
            {splitTotal && sessionValid && (
              <p className="text-xs text-neutral-600">
                {formatDuration(splitTotal)} を {splitSessions(splitTotal, session).map((m) => `${m}分`).join("・")} に分け、1日1回ずつ空き時間（8:00〜22:00）に入れます。
              </p>
            )}
            {proposal && (
              <ul className="flex flex-col gap-1.5" data-testid="split-candidates">
                {proposal.candidates.map((c, i) =>
                  removed.has(i) ? null : (
                    <li key={`${c.date}-${i}`} className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-neutral-200" data-testid="split-candidate">
                      <span className="flex-1 tabular-nums">
                        {formatDateLabel(c.date)} {formatMinutes(c.startMin)}–{formatMinutes(c.startMin + c.durationMin)}
                        <span className="ml-1 text-xs text-neutral-500">{c.durationMin}分</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setRemoved((r) => new Set(r).add(i))}
                        aria-label={`${formatDateLabel(c.date)}の候補を外す`}
                        className="grid size-11 place-items-center text-neutral-400 active:text-rose-600"
                      >
                        ✕
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}
            {proposal && proposal.unplacedMinutes > 0 && (
              <p className="text-xs text-amber-800">30日以内の空き時間に入らない {formatDuration(proposal.unplacedMinutes)} は候補に含めていません。</p>
            )}
            <p className="text-[11px] text-neutral-500">「作成」を押すまで保存しません。外したい候補は ✕ で外せます。</p>
          </div>
        )}

        {needsExtra && (
          <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-testid="over-plan">
            <p>
              予定が残り必要時間を{formatDuration(overBy)}超えます（残り {formatDuration(progress.remainingMinutes ?? 0)}、予定済み {formatDuration(progress.plannedMinutes)} ＋ 今回{" "}
              {formatDuration(newMinutes)}）。
            </p>
            <label className="mt-1 flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} className="size-5" />
              追加練習として予定する
            </label>
          </div>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="button"
          disabled={!canCreate || guard.isBusy("create")}
          onClick={create}
          className="h-12 rounded-xl bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700 disabled:opacity-40"
        >
          {mode === "single" ? `タスクを作成（${sessionValid ? formatDuration(session) : "-"}）` : `この内容で作成（${candidates.length}回）`}
        </button>
      </div>
    </Modal>
  );
}
