"use client";

import { useState } from "react";
import { STEP_STATUS_LABELS, wouldCreateCycle } from "@/lib/goals";
import { actions } from "@/lib/store";
import type { GoalStep, StepStatus } from "@/lib/types";
import { Modal } from "../Modal";
import { HoursInput, Segmented, TextArea, TextField } from "./fields";

/** 工程の追加・編集。前提の工程は同じ目標の工程から選び、循環する組み合わせは選べない */
export function StepForm({
  goalId,
  initial,
  siblings,
  onClose,
  onDelete,
}: {
  goalId: string;
  initial: GoalStep | null;
  /** 同じ目標の工程（作業順） */
  siblings: GoalStep[];
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [minutes, setMinutes] = useState<number | null>(initial?.estimatedMinutes ?? null);
  const [status, setStatus] = useState<StepStatus>(initial?.status ?? "todo");
  const [deps, setDeps] = useState<string[]>(initial?.dependsOn ?? []);
  const [error, setError] = useState<string | null>(null);
  const selfId = initial?.id ?? "__new__";
  const candidates = siblings.filter((s) => s.id !== selfId);

  return (
    <Modal title={initial ? "工程を編集" : "工程を追加"} onClose={onClose} testId="step-form">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const r = actions.saveStep({ id: initial?.id, goalId, title, note, estimatedMinutes: minutes, status, dependsOn: deps });
          if (!r.ok) return setError(r.message);
          onClose();
        }}
      >
        <TextField id="step-title" label="工程名" value={title} onChange={setTitle} placeholder="例：単語帳を1周する" maxLength={80} />
        <TextArea id="step-note" label="具体的な作業（任意）" value={note} onChange={setNote} placeholder="例：1日100語ずつ、例文も読む" />
        <HoursInput id="step-minutes" label="必要時間（任意）" minutes={minutes} onChange={setMinutes} />
        <Segmented
          label="状態"
          value={status}
          onChange={(v) => setStatus(v as StepStatus)}
          options={(["todo", "doing", "done", "skipped"] as StepStatus[]).map((s) => ({ value: s, label: STEP_STATUS_LABELS[s] }))}
        />

        {candidates.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-neutral-500">先に終わらせる工程（任意・複数可）</legend>
            <div className="flex flex-col gap-1">
              {candidates.map((c) => {
                const on = deps.includes(c.id);
                // 選ぶと循環してしまう工程は選べない
                const cyclic = !on && wouldCreateCycle(siblings, selfId, [...deps, c.id]);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    disabled={cyclic}
                    onClick={() => setDeps((cur) => (on ? cur.filter((x) => x !== c.id) : [...cur, c.id]))}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm transition disabled:opacity-40 ${
                      on ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 active:bg-neutral-200"
                    }`}
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded border border-current text-xs">{on ? "✓" : ""}</span>
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    {cyclic && <span className="shrink-0 text-[11px]">循環するため不可</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="submit" className="h-12 rounded-xl bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700">
          {initial ? "保存" : "工程を追加"}
        </button>
        {initial && onDelete && (
          <button type="button" onClick={onDelete} className="h-11 rounded-xl text-sm text-rose-600 active:bg-rose-50">
            この工程を削除
          </button>
        )}
      </form>
    </Modal>
  );
}
