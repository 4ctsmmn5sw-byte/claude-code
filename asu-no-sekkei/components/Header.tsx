"use client";

import Link from "next/link";
import { addDays, formatDateLabel, relativeLabel } from "@/lib/date";
import type { DateKey } from "@/lib/types";

export function Header({
  date,
  today,
  onChange,
}: {
  date: DateKey;
  today: DateKey;
  onChange: (date: DateKey) => void;
}) {
  const tomorrow = addDays(today, 1);
  const rel = relativeLabel(date, today);
  const pill = (active: boolean) =>
    `h-9 rounded-full px-3.5 text-sm font-medium transition ${
      active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
    }`;

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200/80 bg-white/90 px-4 py-2.5 backdrop-blur sm:px-6">
      <h1 className="text-[15px] font-semibold tracking-tight text-neutral-900">明日の設計</h1>

      <div className="order-3 flex w-full items-center justify-between gap-2 sm:order-none sm:w-auto sm:flex-1 sm:justify-center">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(addDays(date, -1))}
            className="grid size-9 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
            aria-label="前の日"
          >
            <Chevron dir="left" />
          </button>
          <div className="min-w-[10.5rem] text-center" data-testid="current-date">
            <span className="text-base font-semibold tabular-nums text-neutral-900">{formatDateLabel(date)}</span>
            {rel && (
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">{rel}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange(addDays(date, 1))}
            className="grid size-9 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
            aria-label="次の日"
          >
            <Chevron dir="right" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={pill(date === today)} onClick={() => onChange(today)}>
            今日
          </button>
          <button type="button" className={pill(date === tomorrow)} onClick={() => onChange(tomorrow)}>
            明日
          </button>
        </div>
      </div>

      <Link
        href="/settings"
        className="ml-auto flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-neutral-600 hover:bg-neutral-100 sm:ml-0"
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
          <path d="M16.2 12.3a1.3 1.3 0 0 0 .3 1.4l.05.05a1.6 1.6 0 1 1-2.25 2.25l-.05-.05a1.3 1.3 0 0 0-1.4-.3 1.3 1.3 0 0 0-.8 1.2v.15a1.6 1.6 0 0 1-3.2 0v-.08a1.3 1.3 0 0 0-.85-1.2 1.3 1.3 0 0 0-1.4.3l-.05.05a1.6 1.6 0 1 1-2.25-2.25l.05-.05a1.3 1.3 0 0 0 .3-1.4 1.3 1.3 0 0 0-1.2-.8H3.3a1.6 1.6 0 0 1 0-3.2h.08a1.3 1.3 0 0 0 1.2-.85 1.3 1.3 0 0 0-.3-1.4l-.05-.05A1.6 1.6 0 1 1 6.48 3.9l.05.05a1.3 1.3 0 0 0 1.4.3h.07a1.3 1.3 0 0 0 .8-1.2V3a1.6 1.6 0 0 1 3.2 0v.08a1.3 1.3 0 0 0 .8 1.2 1.3 1.3 0 0 0 1.4-.3l.05-.05a1.6 1.6 0 1 1 2.25 2.25l-.05.05a1.3 1.3 0 0 0-.3 1.4v.07a1.3 1.3 0 0 0 1.2.8h.15a1.6 1.6 0 0 1 0 3.2h-.08a1.3 1.3 0 0 0-1.2.8Z" />
        </svg>
        <span>固定予定・設定</span>
      </Link>
    </header>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d={dir === "left" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
