"use client";

import { formatDateLabel, WEEKDAY_LABELS, WEEKDAY_ORDER } from "@/lib/date";
import type { RuleConflicts } from "@/lib/schedule";
import { formatMinutes } from "@/lib/time";
import type { DateKey, Weekday } from "@/lib/types";

const PRESETS: { label: string; days: Weekday[] }[] = [
  { label: "平日", days: [1, 2, 3, 4, 5] },
  { label: "土日", days: [0, 6] },
  { label: "毎日", days: [0, 1, 2, 3, 4, 5, 6] },
];

/** 月〜日の曜日選択（複数選択・44px） */
export function WeekdayPicker({ value, onChange, legend }: { value: Weekday[]; onChange: (v: Weekday[]) => void; legend: string }) {
  const toggle = (w: Weekday) => onChange(value.includes(w) ? value.filter((x) => x !== w) : [...value, w]);
  return (
    <fieldset data-testid="weekday-picker">
      <legend className="mb-1.5 text-xs font-medium text-neutral-500">{legend}</legend>
      <div className="flex justify-between gap-1">
        {WEEKDAY_ORDER.map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={value.includes(w)}
            onClick={() => toggle(w)}
            className={`size-11 rounded-full text-sm font-medium transition ${
              value.includes(w) ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 active:bg-neutral-200"
            }`}
          >
            {WEEKDAY_LABELS[w]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.days)}
            className="h-11 flex-1 rounded-full text-sm text-neutral-600 ring-1 ring-neutral-200 active:bg-neutral-100"
          >
            {p.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function DateField({
  id,
  label,
  value,
  onChange,
  clearable = true,
  emptyLabel = "指定なし",
}: {
  id: string;
  label: string;
  value: DateKey | null;
  onChange: (v: DateKey | null) => void;
  clearable?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-neutral-500">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-12 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-base tabular-nums outline-none focus:border-neutral-400"
        />
        {clearable && value && (
          <button type="button" onClick={() => onChange(null)} className="h-12 shrink-0 px-2 text-xs text-neutral-500" aria-label={`${label}を${emptyLabel}にする`}>
            解除
          </button>
        )}
      </div>
      {!value && <span className="text-[11px] text-neutral-400">{emptyLabel}</span>}
    </div>
  );
}

/**
 * 毎週の規則が既存の予定と重なるときの警告。
 * 予定の削除・移動はしないことを明示し、保存するかどうかは利用者に委ねる。
 */
export function ConflictWarning({ conflicts }: { conflicts: RuleConflicts }) {
  const total = conflicts.tasks.length + conflicts.fixed.length;
  if (total === 0) return null;
  const shown = conflicts.tasks.slice(0, 3);
  return (
    <div role="alert" data-testid="conflict-warning" className="rounded-2xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
      <p className="font-semibold">重なる予定が{total}件あります</p>
      <ul className="mt-1 list-disc pl-4">
        {shown.map((t) => (
          <li key={`${t.id}`}>
            {formatDateLabel(t.date)} {formatMinutes(t.startMin)}–{formatMinutes(t.startMin + t.durationMin)}「{t.title}」
          </li>
        ))}
        {conflicts.tasks.length > shown.length && <li>ほか{conflicts.tasks.length - shown.length}件のタスク</li>}
        {conflicts.fixed.map((e) => (
          <li key={e.id}>
            固定予定「{e.title}」{formatMinutes(e.startMin)}–{formatMinutes(e.endMin)}
          </li>
        ))}
      </ul>
      <p className="mt-1">重なる予定は削除・移動しません。保存すると、重なったタスクは赤枠で表示されます。</p>
    </div>
  );
}
