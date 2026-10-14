"use client";

import { useState } from "react";
import { GOAL_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/goals";
import { actions, type GoalInput } from "@/lib/store";
import type { Goal, GoalPriority, GoalStatus } from "@/lib/types";
import { Modal } from "../Modal";
import { DateField } from "../WeeklyFields";
import { HoursInput, Segmented, TextArea, TextField } from "./fields";

const CATEGORY_SUGGESTIONS = ["学業", "仕事", "資格", "健康", "趣味", "生活"];

/** 目標の追加・編集 */
export function GoalForm({
  initial,
  defaultStatus,
  categories,
  onClose,
  onSaved,
}: {
  initial: Goal | null;
  defaultStatus: GoalStatus;
  /** 既存の目標で使っているカテゴリー（候補に出す） */
  categories: string[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [v, setV] = useState<GoalInput>(() => ({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    successCriteria: initial?.successCriteria ?? "",
    deadline: initial?.deadline ?? null,
    priority: initial?.priority ?? "medium",
    estimatedMinutes: initial?.estimatedMinutes ?? null,
    category: initial?.category ?? "",
    status: initial?.status ?? defaultStatus,
  }));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof GoalInput>(k: K, val: GoalInput[K]) => setV((cur) => ({ ...cur, [k]: val }));
  const suggestions = [...new Set([...categories, ...CATEGORY_SUGGESTIONS])].filter(Boolean).slice(0, 8);

  return (
    <Modal title={initial ? "目標を編集" : "目標を追加"} onClose={onClose} testId="goal-form">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const r = actions.saveGoal({ ...v, id: initial?.id });
          if (!r.ok) return setError(r.message);
          onSaved(r.id!);
        }}
      >
        <TextField id="goal-title" label="目標名" value={v.title} onChange={(x) => set("title", x)} placeholder="例：TOEIC 800点を取る" maxLength={80} />

        <Segmented
          label="区分"
          value={v.status === "wish" ? "wish" : v.status}
          onChange={(x) => set("status", x as GoalStatus)}
          options={(["wish", "active", "paused"] as GoalStatus[]).map((s) => ({ value: s, label: GOAL_STATUS_LABELS[s] }))}
        />

        <TextArea id="goal-desc" label="説明" value={v.description} onChange={(x) => set("description", x)} placeholder="なぜ取り組むのか、今どこにいるのか" />
        <TextArea id="goal-criteria" label="達成条件" value={v.successCriteria} onChange={(x) => set("successCriteria", x)} placeholder="例：公式テストで800点以上のスコアを得る" />

        <div className="grid grid-cols-2 gap-3">
          <DateField id="goal-deadline" label="達成期限（任意）" value={v.deadline} onChange={(x) => set("deadline", x)} emptyLabel="期限なし" />
          <HoursInput id="goal-estimate" label="想定必要時間（任意）" minutes={v.estimatedMinutes} onChange={(x) => set("estimatedMinutes", x)} />
        </div>

        <Segmented
          label="優先度"
          value={v.priority}
          onChange={(x) => set("priority", x as GoalPriority)}
          options={(["high", "medium", "low"] as GoalPriority[]).map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
        />

        <div>
          <TextField id="goal-category" label="カテゴリー" value={v.category} onChange={(x) => set("category", x)} placeholder="例：資格" maxLength={30} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("category", c)}
                className={`h-11 rounded-full px-3.5 text-sm ${v.category === c ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 active:bg-neutral-200"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="submit" className="h-12 rounded-xl bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700">
          {initial ? "保存" : "目標を追加"}
        </button>
      </form>
    </Modal>
  );
}
