"use client";

import Link from "next/link";
import { useState } from "react";
import { DEFAULT_FIXED_COLOR, FIXED_COLORS, fixedColor } from "@/lib/colors";
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from "@/lib/date";
import { actions, useAppStore } from "@/lib/store";
import { formatMinutes } from "@/lib/time";
import type { FixedEvent, SnapMinutes, Weekday } from "@/lib/types";
import { ColorPicker } from "./TaskPanel";
import { TimeInput } from "./TimeInput";

const PRESETS: { label: string; days: Weekday[] }[] = [
  { label: "平日", days: [1, 2, 3, 4, 5] },
  { label: "土日", days: [0, 6] },
  { label: "毎日", days: [0, 1, 2, 3, 4, 5, 6] },
];

export function SettingsView() {
  const store = useAppStore();
  const [editing, setEditing] = useState<FixedEvent | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!store) {
    return <div className="flex h-dvh items-center justify-center text-sm text-neutral-400">読み込み中…</div>;
  }
  const { fixedEvents, settings } = store.data;

  return (
    <div className="min-h-dvh bg-neutral-50/60">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <Link href="/" className="flex h-9 items-center gap-1 rounded-full px-3 text-sm text-neutral-600 hover:bg-neutral-100">
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          タイムラインへ
        </Link>
        <h1 className="text-[15px] font-semibold text-neutral-900">固定予定・設定</h1>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6">
        {message && (
          <div role="status" className="rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white">
            {message}
          </div>
        )}

        <section className="rounded-2xl bg-white p-5 ring-1 ring-neutral-200/80">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">曜日ごとの固定予定</h2>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                登録した予定は、該当する曜日のタイムラインに毎週自動で表示されます。変更するとこれから表示する日すべてに反映されます。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="h-9 shrink-0 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-700"
            >
              ＋ 固定予定を追加
            </button>
          </div>

          {editing && (
            <FixedEventForm
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? null : editing}
              onCancel={() => setEditing(null)}
              onSaved={(msg) => {
                setEditing(null);
                setMessage(msg);
              }}
            />
          )}

          <WeekOverview events={fixedEvents} onEdit={(e) => setEditing(e)} />

          {fixedEvents.length > 0 && (
            <ul className="mt-5 divide-y divide-neutral-100" data-testid="fixed-list">
              {[...fixedEvents]
                .sort((a, b) => a.startMin - b.startMin)
                .map((e) => {
                  const c = fixedColor(e.color);
                  return (
                    <li key={e.id} className="flex items-center gap-3 py-3">
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: c.accent }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-neutral-900">{e.title}</div>
                        <div className="text-xs tabular-nums text-neutral-500">
                          {WEEKDAY_ORDER.filter((w) => e.weekdays.includes(w))
                            .map((w) => WEEKDAY_LABELS[w])
                            .join("・")}
                          　{formatMinutes(e.startMin)}–{formatMinutes(e.endMin)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditing(e)}
                        className="h-8 rounded-md px-2.5 text-xs text-neutral-600 hover:bg-neutral-100"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`固定予定「${e.title}」を削除しますか？`)) return;
                          actions.deleteFixedEvent(e.id);
                          setMessage("固定予定を削除しました");
                        }}
                        className="h-8 rounded-md px-2.5 text-xs text-rose-600 hover:bg-rose-50"
                      >
                        削除
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-neutral-200/80">
          <h2 className="text-sm font-semibold text-neutral-900">ドラッグの刻み</h2>
          <p className="mt-1 text-xs text-neutral-500">タイムラインでの移動・長さ変更の単位です。時刻の直接入力は常に1分単位で行えます。</p>
          <div className="mt-3 flex gap-2" role="radiogroup" aria-label="ドラッグの刻み">
            {([5, 1] as SnapMinutes[]).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={settings.snapMinutes === v}
                onClick={() => actions.updateSettings({ snapMinutes: v })}
                className={`h-9 rounded-full px-4 text-sm transition ${
                  settings.snapMinutes === v ? "bg-neutral-900 text-white" : "text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50"
                }`}
              >
                {v}分刻み{v === 5 && "（標準）"}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 text-xs leading-relaxed text-neutral-500 ring-1 ring-neutral-200/80">
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">データの保存について</h2>
          データはこのブラウザ（localStorage）にのみ保存されます。別の端末やブラウザには自動で同期されません。
          ブラウザのサイト データを消去すると、タスクと固定予定も消えます。
        </section>
      </main>
    </div>
  );
}

function WeekOverview({ events, onEdit }: { events: FixedEvent[]; onEdit: (e: FixedEvent) => void }) {
  return (
    <div className="mt-5 grid grid-cols-7 gap-1.5" data-testid="week-overview">
      {WEEKDAY_ORDER.map((w) => {
        const list = events.filter((e) => e.weekdays.includes(w)).sort((a, b) => a.startMin - b.startMin);
        return (
          <div key={w} className="flex min-w-0 flex-col gap-1">
            <div className={`text-center text-xs font-medium ${w === 0 ? "text-rose-500" : w === 6 ? "text-blue-500" : "text-neutral-500"}`}>
              {WEEKDAY_LABELS[w]}
            </div>
            <div className="flex min-h-16 flex-col gap-1 rounded-lg bg-neutral-50 p-1">
              {list.map((e) => {
                const c = fixedColor(e.color);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onEdit(e)}
                    className="min-w-0 rounded-md px-1 py-1 text-left"
                    style={{ backgroundColor: c.bg, color: c.text, boxShadow: `inset 2px 0 0 ${c.accent}` }}
                  >
                    <div className="truncate text-[11px] font-semibold">{e.title}</div>
                    <div className="truncate text-[10px] tabular-nums opacity-70">{formatMinutes(e.startMin)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FixedEventForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: FixedEvent | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [weekdays, setWeekdays] = useState<Weekday[]>(initial?.weekdays ?? []);
  const [start, setStart] = useState<number | null>(initial?.startMin ?? 9 * 60);
  const [end, setEnd] = useState<number | null>(initial?.endMin ?? 12 * 60);
  const [color, setColor] = useState(initial?.color ?? DEFAULT_FIXED_COLOR);
  const [error, setError] = useState<string | null>(null);

  const toggle = (w: Weekday) => setWeekdays((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]));

  return (
    <form
      data-testid="fixed-form"
      className="mt-5 flex flex-col gap-4 rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-200/70"
      onSubmit={(e) => {
        e.preventDefault();
        if (start === null || end === null) return setError("開始・終了時刻を入力してください");
        const r = actions.saveFixedEvent({ id: initial?.id, title, weekdays, startMin: start, endMin: end, color });
        if (!r.ok) return setError(r.message);
        onSaved(initial ? "固定予定を更新しました" : "固定予定を追加しました");
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="fixed-title" className="text-xs font-medium text-neutral-500">
          予定名
        </label>
        <input
          id="fixed-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：大学"
          maxLength={60}
          className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-base outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 sm:text-sm"
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-neutral-500">曜日（複数選択できます）</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {WEEKDAY_ORDER.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={weekdays.includes(w)}
              onClick={() => toggle(w)}
              className={`size-9 rounded-full text-sm font-medium transition ${
                weekdays.includes(w) ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-100"
              }`}
            >
              {WEEKDAY_LABELS[w]}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-neutral-200" />
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setWeekdays(p.days)}
              className="h-8 rounded-full px-3 text-xs text-neutral-600 ring-1 ring-neutral-200 hover:bg-white"
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid max-w-xs grid-cols-2 gap-3">
        <TimeInput id="fixed-start" label="開始" value={start} onChange={setStart} />
        <TimeInput id="fixed-end" label="終了" value={end} onChange={setEnd} allow24 />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-neutral-500">色（タスクとは別の落ち着いた色で表示されます）</span>
        <ColorPicker value={color} onChange={setColor} colors={FIXED_COLORS} />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" className="h-10 rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-700">
          {initial ? "更新" : "登録"}
        </button>
        <button type="button" onClick={onCancel} className="h-10 rounded-lg px-4 text-sm text-neutral-600 hover:bg-neutral-100">
          キャンセル
        </button>
      </div>
    </form>
  );
}
