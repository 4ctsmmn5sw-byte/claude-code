"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { DEFAULT_FIXED_COLOR, FIXED_COLORS, fixedColor } from "@/lib/colors";
import { formatDateLabel, WEEKDAY_LABELS, WEEKDAY_ORDER } from "@/lib/date";
import { actions, useAppStore } from "@/lib/store";
import { formatMinutes } from "@/lib/time";
import type { AppData, DateKey, FixedEvent, SnapMinutes, Weekday } from "@/lib/types";
import { Modal } from "./Modal";
import { ColorPicker } from "./TaskSheet";
import { TimeInput } from "./TimeInput";

const PRESETS: { label: string; days: Weekday[] }[] = [
  { label: "平日", days: [1, 2, 3, 4, 5] },
  { label: "土日", days: [0, 6] },
  { label: "毎日", days: [0, 1, 2, 3, 4, 5, 6] },
];

export function SettingsView() {
  const store = useAppStore();
  const editParam = useSearchParams().get("edit");
  if (!store) {
    return <div className="flex h-dvh items-center justify-center text-sm text-neutral-400">読み込み中…</div>;
  }
  return <SettingsContent data={store.data} editParam={editParam} />;
}

function periodLabel(e: FixedEvent): string | null {
  if (!e.validFrom && !e.validTo) return null;
  const f = (d: DateKey) => formatDateLabel(d).replace(/（.）/, "");
  return `${e.validFrom ? f(e.validFrom) : ""}〜${e.validTo ? f(e.validTo) : ""}`;
}

function SettingsContent({ data, editParam }: { data: AppData; editParam: string | null }) {
  const { fixedEvents, settings } = data;
  // タイムラインの「毎週の予定を編集する」から来たときは、その予定の編集画面を開いた状態で始める
  const [editing, setEditing] = useState<FixedEvent | "new" | null>(
    () => (editParam && fixedEvents.find((e) => e.id === editParam)) || null,
  );
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="mx-auto min-h-dvh max-w-[520px] bg-neutral-50 sm:border-x sm:border-neutral-200">
      <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-neutral-200/80 bg-white/95 px-1.5 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Link href="/" className="flex h-12 items-center gap-1 rounded-full px-3 text-sm text-neutral-600 active:bg-neutral-100">
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          タイムラインへ
        </Link>
        <h1 className="ml-auto pr-4 text-[15px] font-semibold text-neutral-900">固定予定・設定</h1>
      </header>

      <main className="flex flex-col gap-5 px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+32px)]">
        {message && (
          <div role="status" className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm text-white">
            {message}
          </div>
        )}

        <section className="rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80">
          <h2 className="text-[15px] font-semibold text-neutral-900">曜日ごとの固定予定</h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            登録した予定は、対象の曜日のタイムラインに毎週自動で表示されます（鍵マーク付き・ドラッグでは動きません）。
            編集すると、これから表示する日すべてに反映されます。
          </p>

          <WeekOverview events={fixedEvents} onEdit={setEditing} />

          {fixedEvents.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2" data-testid="fixed-list">
              {[...fixedEvents]
                .sort((a, b) => a.startMin - b.startMin)
                .map((e) => {
                  const c = fixedColor(e.color);
                  const period = periodLabel(e);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(e)}
                        className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-neutral-50 px-4 py-2 text-left active:bg-neutral-100"
                        aria-label={`${e.title}を編集`}
                      >
                        <span className="h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: c.accent }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-neutral-900">{e.title}</span>
                          <span className="block text-xs tabular-nums text-neutral-500">
                            {WEEKDAY_ORDER.filter((w) => e.weekdays.includes(w))
                              .map((w) => WEEKDAY_LABELS[w])
                              .join("・")}
                            　{formatMinutes(e.startMin)}–{formatMinutes(e.endMin)}
                          </span>
                          {(period || e.skipDates.length > 0) && (
                            <span className="block text-xs text-neutral-400">
                              {period && `期間 ${period}`}
                              {period && e.skipDates.length > 0 && "　"}
                              {e.skipDates.length > 0 && `休み ${e.skipDates.length}日`}
                            </span>
                          )}
                        </span>
                        <span className="text-sm text-neutral-400">編集</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setEditing("new")}
            className="mt-4 h-12 w-full rounded-2xl bg-neutral-900 text-[15px] font-semibold text-white active:bg-neutral-700"
          >
            ＋ 固定予定を追加
          </button>
        </section>

        <section className="rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80">
          <h2 className="text-[15px] font-semibold text-neutral-900">ドラッグの吸着単位</h2>
          <p className="mt-1 text-xs text-neutral-500">タイムラインでの移動・長さ変更・タップ配置の単位です。編集画面の時刻入力は常に1分単位です。</p>
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="ドラッグの吸着単位">
            {([5, 1] as SnapMinutes[]).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={settings.snapMinutes === v}
                onClick={() => actions.updateSettings({ snapMinutes: v })}
                className={`h-12 rounded-2xl text-sm font-medium transition ${
                  settings.snapMinutes === v ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 active:bg-neutral-200"
                }`}
              >
                {v}分刻み{v === 5 && "（標準）"}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-4 text-xs leading-relaxed text-neutral-500 ring-1 ring-neutral-200/80">
          <h2 className="mb-1 text-[15px] font-semibold text-neutral-900">データの保存について</h2>
          データはこのブラウザ（localStorage）にのみ保存されます。別の端末やブラウザには自動で同期されません。
          ブラウザのサイトデータを消去すると、タスクと固定予定も消えます。
        </section>
      </main>

      {editing && (
        <FixedEventForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : (fixedEvents.find((e) => e.id === editing.id) ?? editing)}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            setEditing(null);
            setMessage(msg);
          }}
        />
      )}
    </div>
  );
}

function WeekOverview({ events, onEdit }: { events: FixedEvent[]; onEdit: (e: FixedEvent) => void }) {
  return (
    <div className="mt-4 grid grid-cols-7 gap-1" data-testid="week-overview">
      {WEEKDAY_ORDER.map((w) => {
        const list = events.filter((e) => e.weekdays.includes(w)).sort((a, b) => a.startMin - b.startMin);
        return (
          <div key={w} className="flex min-w-0 flex-col gap-1">
            <div className={`text-center text-xs font-medium ${w === 0 ? "text-rose-500" : w === 6 ? "text-blue-500" : "text-neutral-500"}`}>
              {WEEKDAY_LABELS[w]}
            </div>
            <div className="flex min-h-14 flex-col gap-1 rounded-xl bg-neutral-50 p-0.5">
              {list.map((e) => {
                const c = fixedColor(e.color);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onEdit(e)}
                    className="min-h-11 min-w-0 rounded-lg px-1 py-1 text-left"
                    style={{ backgroundColor: c.bg, color: c.text, boxShadow: `inset 2px 0 0 ${c.accent}` }}
                  >
                    <div className="truncate text-[10px] font-semibold">{e.title}</div>
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

function DateField({ id, label, value, onChange }: { id: string; label: string; value: DateKey | null; onChange: (v: DateKey | null) => void }) {
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
        {value && (
          <button type="button" onClick={() => onChange(null)} className="h-12 shrink-0 px-2 text-xs text-neutral-500" aria-label={`${label}を指定なしにする`}>
            解除
          </button>
        )}
      </div>
      {!value && <span className="text-[11px] text-neutral-400">指定なし</span>}
    </div>
  );
}

function FixedEventForm({
  initial,
  onClose,
  onDone,
}: {
  initial: FixedEvent | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [weekdays, setWeekdays] = useState<Weekday[]>(initial?.weekdays ?? []);
  const [start, setStart] = useState<number | null>(initial?.startMin ?? 9 * 60);
  const [end, setEnd] = useState<number | null>(initial?.endMin ?? 12 * 60);
  const [validFrom, setValidFrom] = useState<DateKey | null>(initial?.validFrom ?? null);
  const [validTo, setValidTo] = useState<DateKey | null>(initial?.validTo ?? null);
  const [color, setColor] = useState(initial?.color ?? DEFAULT_FIXED_COLOR);
  const [error, setError] = useState<string | null>(null);

  const toggle = (w: Weekday) => setWeekdays((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]));

  return (
    <Modal title={initial ? "毎週の予定を編集" : "固定予定を追加"} onClose={onClose} testId="fixed-form">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (start === null || end === null) return setError("開始・終了時刻を入力してください");
          const r = actions.saveFixedEvent({ id: initial?.id, title, weekdays, startMin: start, endMin: end, color, validFrom, validTo });
          if (!r.ok) return setError(r.message);
          onDone(initial ? "固定予定を更新しました（これから表示する日すべてに反映されます）" : "固定予定を追加しました");
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
            className="h-12 rounded-xl border border-neutral-200 bg-white px-4 text-base outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-neutral-500">毎週繰り返す曜日（複数選択できます）</legend>
          <div className="flex justify-between gap-1">
            {WEEKDAY_ORDER.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={weekdays.includes(w)}
                onClick={() => toggle(w)}
                className={`size-11 rounded-full text-sm font-medium transition ${
                  weekdays.includes(w) ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 active:bg-neutral-200"
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
                onClick={() => setWeekdays(p.days)}
                className="h-11 flex-1 rounded-full text-sm text-neutral-600 ring-1 ring-neutral-200 active:bg-neutral-100"
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <TimeInput id="fixed-start" label="開始時刻" value={start} onChange={setStart} />
          <TimeInput id="fixed-end" label="終了時刻" value={end} onChange={setEnd} allow24 />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DateField id="fixed-from" label="適用開始日" value={validFrom} onChange={setValidFrom} />
          <DateField id="fixed-to" label="適用終了日" value={validTo} onChange={setValidTo} />
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-500">色（タスクとは別の落ち着いた色・鍵マークで表示）</span>
          <ColorPicker value={color} onChange={setColor} colors={FIXED_COLORS} />
        </div>

        {initial && initial.skipDates.length > 0 && (
          <div data-testid="skip-dates">
            <span className="mb-1 block text-xs font-medium text-neutral-500">この日だけ休みにした日（毎週の設定とは別に保存）</span>
            <div className="flex flex-wrap gap-1.5">
              {initial.skipDates.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => actions.unskipFixedEventOn(initial.id, d)}
                  className="flex h-11 items-center gap-1.5 rounded-full bg-neutral-100 px-3 text-sm text-neutral-700 active:bg-neutral-200"
                  aria-label={`${formatDateLabel(d)}の休みを取り消す`}
                >
                  {formatDateLabel(d)}
                  <span className="text-neutral-400">✕</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button type="submit" className="h-12 rounded-xl bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700">
          {initial ? "更新" : "登録"}
        </button>
        {initial && (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`固定予定「${initial.title}」を削除しますか？（すべての週から消えます）`)) return;
              actions.deleteFixedEvent(initial.id);
              onDone("固定予定を削除しました");
            }}
            className="h-11 rounded-xl text-sm text-rose-600 active:bg-rose-50"
          >
            この固定予定を削除
          </button>
        )}
      </form>
    </Modal>
  );
}
