"use client";

import { useState } from "react";

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-4 text-base outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200";

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength = 120,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-neutral-500">
        {label}
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} className={`h-12 ${inputCls}`} />
    </div>
  );
}

export function TextArea({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-neutral-500">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={1000}
        rows={2}
        className={`min-h-20 py-3 leading-relaxed ${inputCls}`}
      />
    </div>
  );
}

/** 選択肢が少ないときの切り替え（44px） */
export function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
      <div className="grid gap-1 rounded-2xl bg-neutral-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`h-11 rounded-xl text-sm font-medium transition ${value === o.value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 active:bg-neutral-200"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 時間の入力（「時間」と「分」の 2 欄。保存は分単位）。空欄なら null */
export function HoursInput({
  id,
  label,
  minutes,
  onChange,
}: {
  id: string;
  label: string;
  minutes: number | null;
  onChange: (min: number | null) => void;
}) {
  const [h, setH] = useState(minutes === null ? "" : String(Math.floor(minutes / 60)));
  const [m, setM] = useState(minutes === null ? "" : String(minutes % 60));
  const update = (hs: string, ms: string) => {
    setH(hs);
    setM(ms);
    if (hs.trim() === "" && ms.trim() === "") return onChange(null);
    const total = (Number(hs) || 0) * 60 + (Number(ms) || 0);
    onChange(Number.isFinite(total) && total > 0 ? Math.round(total) : null);
  };
  const cls = "h-12 w-full min-w-0 rounded-xl border border-neutral-200 bg-white px-2 text-right text-base tabular-nums outline-none focus:border-neutral-400";
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-xs font-medium text-neutral-500">{label}</legend>
      <div className="flex items-center gap-1 text-sm text-neutral-500">
        <input id={id} aria-label={`${label}（時間）`} inputMode="numeric" type="number" min={0} value={h} onChange={(e) => update(e.target.value, m)} className={cls} />
        <span className="shrink-0">時間</span>
        <input aria-label={`${label}（分）`} inputMode="numeric" type="number" min={0} max={59} value={m} onChange={(e) => update(h, e.target.value)} className={cls} />
        <span className="shrink-0">分</span>
      </div>
    </fieldset>
  );
}
