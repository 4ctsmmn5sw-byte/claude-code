"use client";

import { useState } from "react";
import { formatMinutes, parseTime } from "@/lib/time";

/**
 * 1 分単位の時刻入力。"930" "9:30" "09:30" などを受け付け、確定時に "09:30" へ整形する。
 * ブラウザ標準の type="time" は 24:00 を入力できず、iOS では見た目も崩れやすいため自前で持つ。
 */
export function TimeInput({
  value,
  onChange,
  allow24 = false,
  label,
  id,
  invalid = false,
}: {
  value: number | null;
  onChange: (min: number | null) => void;
  allow24?: boolean;
  label: string;
  id: string;
  invalid?: boolean;
}) {
  const formatted = value === null ? "" : formatMinutes(value);
  const [text, setText] = useState(formatted);
  const [lastValue, setLastValue] = useState(value);
  const [error, setError] = useState(false);

  // 親から値が変わったら表示も追従させる（render 中の同期で effect を使わない）
  if (value !== lastValue) {
    setLastValue(value);
    setText(formatted);
    setError(false);
  }

  const commit = (raw: string) => {
    if (raw.trim() === "") {
      setError(false);
      onChange(null);
      return;
    }
    const parsed = parseTime(raw, { allow24 });
    if (parsed === null) {
      setError(true);
      return;
    }
    setError(false);
    setText(formatMinutes(parsed));
    onChange(parsed);
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-neutral-500">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={allow24 ? "例 18:30" : "例 09:00"}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseTime(e.target.value, { allow24 });
          if (parsed !== null) {
            setError(false);
            setLastValue(parsed);
            onChange(parsed);
          }
        }}
        onBlur={(e) => commit(e.target.value)}
        aria-invalid={error || invalid}
        className={`h-10 w-full rounded-lg border bg-white px-3 text-base tabular-nums outline-none transition focus:ring-2 ${
          error || invalid
            ? "border-rose-300 focus:ring-rose-200"
            : "border-neutral-200 focus:border-neutral-400 focus:ring-neutral-200"
        }`}
      />
      {error && <span className="text-xs text-rose-600">「9:30」のように入力してください</span>}
    </div>
  );
}
