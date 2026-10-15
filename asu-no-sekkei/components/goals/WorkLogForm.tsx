"use client";

import { useState } from "react";
import { useActionGuard } from "@/hooks/useActionGuard";
import { actions } from "@/lib/store";
import type { DateKey, GoalStep } from "@/lib/types";
import { Modal } from "../Modal";
import { DateField } from "../WeeklyFields";
import { TextField } from "./fields";

/** 作業時間の実績を手入力で記録する（タスクを使わずに作業した場合など） */
export function WorkLogForm({
  goalId,
  steps,
  today,
  onClose,
}: {
  goalId: string;
  steps: GoalStep[];
  today: DateKey;
  onClose: () => void;
}) {
  const [date, setDate] = useState<DateKey | null>(today);
  const [minutes, setMinutes] = useState("30");
  const [stepId, setStepId] = useState<string>("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const guard = useActionGuard(800);

  return (
    <Modal title="作業時間を記録" onClose={onClose} testId="worklog-form">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!date) return setError("日付を入力してください");
          guard.run("save", () => {
            const r = actions.addWorkLog({ goalId, stepId: stepId || null, date, minutes: Number(minutes), note });
            if (!r.ok) return setError(r.message);
            onClose();
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <DateField id="log-date" label="日付" value={date} onChange={setDate} clearable={false} emptyLabel="入力してください" />
          <div className="flex flex-col gap-1">
            <label htmlFor="log-minutes" className="text-xs font-medium text-neutral-500">
              作業時間（分）
            </label>
            <input
              id="log-minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="h-12 rounded-xl border border-neutral-200 bg-white px-3 text-base tabular-nums outline-none focus:border-neutral-400"
            />
          </div>
        </div>
        {steps.length > 0 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="log-step" className="text-xs font-medium text-neutral-500">
              工程（任意）
            </label>
            <select
              id="log-step"
              value={stepId}
              onChange={(e) => setStepId(e.target.value)}
              className="h-12 rounded-xl border border-neutral-200 bg-white px-3 text-base outline-none"
            >
              <option value="">指定しない</option>
              {steps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <TextField id="log-note" label="メモ（任意）" value={note} onChange={setNote} maxLength={100} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="submit" className="h-12 rounded-xl bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700">
          記録する
        </button>
      </form>
    </Modal>
  );
}
