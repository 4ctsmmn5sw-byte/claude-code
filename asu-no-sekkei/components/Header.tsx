"use client";

import Link from "next/link";
import { addDays, formatDateLabel, relativeLabel } from "@/lib/date";
import { DEFAULT_PX_PER_MINUTE } from "@/lib/time";
import type { DateKey } from "@/lib/types";

/**
 * 上部の固定ヘッダー。1 行目：前日／日付／翌日／設定、2 行目：今日・明日と表示倍率。
 * ボタンはすべて 44px 以上。
 */
export function Header({
  date,
  today,
  onChange,
  ppm,
  canZoomIn,
  canZoomOut,
  onZoom,
}: {
  date: DateKey;
  today: DateKey;
  onChange: (date: DateKey) => void;
  ppm: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoom: (dir: 1 | -1) => void;
}) {
  const tomorrow = addDays(today, 1);
  const rel = relativeLabel(date, today);
  const seg = (active: boolean) =>
    `h-11 min-w-14 rounded-full px-4 text-sm font-medium transition ${
      active ? "bg-neutral-900 text-white" : "text-neutral-600 active:bg-neutral-100"
    }`;
  const iconBtn = "grid size-11 shrink-0 place-items-center rounded-full text-neutral-600 active:bg-neutral-100 disabled:opacity-30";

  return (
    <header className="z-30 shrink-0 border-b border-neutral-200/80 bg-white pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-1 px-1.5 pt-1">
        <button type="button" onClick={() => onChange(addDays(date, -1))} className={iconBtn} aria-label="前の日">
          <Chevron dir="left" />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2" data-testid="current-date">
          <span className="truncate text-[17px] font-semibold tabular-nums tracking-tight text-neutral-900">
            {formatDateLabel(date)}
          </span>
          {rel && <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">{rel}</span>}
        </div>
        <button type="button" onClick={() => onChange(addDays(date, 1))} className={iconBtn} aria-label="次の日">
          <Chevron dir="right" />
        </button>
        <Link href="/settings" className={iconBtn} aria-label="固定予定・設定">
          <GearIcon />
        </Link>
      </div>
      <div className="flex items-center justify-between px-2 pb-1">
        <div className="flex items-center gap-0.5">
          <button type="button" className={seg(date === today)} onClick={() => onChange(today)}>
            今日
          </button>
          <button type="button" className={seg(date === tomorrow)} onClick={() => onChange(tomorrow)}>
            明日
          </button>
        </div>
        <div className="flex items-center" role="group" aria-label="表示倍率">
          <button type="button" className={iconBtn} onClick={() => onZoom(-1)} disabled={!canZoomOut} aria-label="縮小">
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 10h10" strokeLinecap="round" />
            </svg>
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-neutral-500" data-testid="zoom-label">
            {Math.round((ppm / DEFAULT_PX_PER_MINUTE) * 100)}%
          </span>
          <button type="button" className={iconBtn} onClick={() => onZoom(1)} disabled={!canZoomIn} aria-label="拡大">
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 10h10M10 5v10" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
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

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M16.2 12.3a1.3 1.3 0 0 0 .3 1.4l.05.05a1.6 1.6 0 1 1-2.25 2.25l-.05-.05a1.3 1.3 0 0 0-1.4-.3 1.3 1.3 0 0 0-.8 1.2v.15a1.6 1.6 0 0 1-3.2 0v-.08a1.3 1.3 0 0 0-.85-1.2 1.3 1.3 0 0 0-1.4.3l-.05.05a1.6 1.6 0 1 1-2.25-2.25l.05-.05a1.3 1.3 0 0 0 .3-1.4 1.3 1.3 0 0 0-1.2-.8H3.3a1.6 1.6 0 0 1 0-3.2h.08a1.3 1.3 0 0 0 1.2-.85 1.3 1.3 0 0 0-.3-1.4l-.05-.05A1.6 1.6 0 1 1 6.48 3.9l.05.05a1.3 1.3 0 0 0 1.4.3h.07a1.3 1.3 0 0 0 .8-1.2V3a1.6 1.6 0 0 1 3.2 0v.08a1.3 1.3 0 0 0 .8 1.2 1.3 1.3 0 0 0 1.4-.3l.05-.05a1.6 1.6 0 1 1 2.25 2.25l-.05.05a1.3 1.3 0 0 0-.3 1.4v.07a1.3 1.3 0 0 0 1.2.8h.15a1.6 1.6 0 0 1 0 3.2h-.08a1.3 1.3 0 0 0-1.2.8Z" />
    </svg>
  );
}
