"use client";

import { DragDropProvider, DragOverlay, PointerSensor } from "@dnd-kit/react";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTokyoNowMinutes, useTokyoToday } from "@/hooks/useTokyoClock";
import { useToast } from "@/hooks/useToast";
import { addDays } from "@/lib/date";
import {
  checkPlacement,
  conflictingTaskIds,
  fixedEventsForDate,
  placedTasksForDate,
  unplacedTasks,
} from "@/lib/schedule";
import { actions, useAppStore } from "@/lib/store";
import { formatDuration, minutesToY, pointerToStartMinutes, PX_PER_MINUTE } from "@/lib/time";
import type { AppData, DateKey } from "@/lib/types";
import { Header } from "./Header";
import { DragChip, TaskPanel } from "./TaskPanel";
import { TaskDialog } from "./TaskDialog";
import { Timeline, type DragPreview } from "./Timeline";
import type { DragData } from "./TimelineTaskBlock";
import { Toast } from "./Toast";

/**
 * 入力の種類ごとにドラッグ開始条件を変える。
 * - マウス／ペン：4px 動かしたら開始（クリックは編集として扱える）
 * - タッチ：220ms 長押しで開始。それまでに 8px 以上動けば通常のスクロールになる
 */
const sensors = [
  PointerSensor.configure({
    activationConstraints(event) {
      if (event.pointerType === "touch") {
        return [new PointerActivationConstraints.Delay({ value: 220, tolerance: 8 })];
      }
      return [new PointerActivationConstraints.Distance({ value: 4 })];
    },
  }),
];

interface DragSession {
  taskId: string;
  kind: DragData["kind"];
  /** 掴んだ位置からタスク上端までの距離（px） */
  grabOffsetPx: number;
  durationMin: number;
  title: string;
  color: string;
}

export function Planner() {
  const store = useAppStore();
  const today = useTokyoToday();

  if (!store || !today) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-neutral-400" aria-busy="true">
        読み込み中…
      </div>
    );
  }
  return <PlannerView data={store.data} warning={store.warning} today={today} />;
}

function PlannerView({ data, warning, today }: { data: AppData; warning: string | null; today: DateKey }) {
  const [viewDate, setViewDate] = useState<DateKey>(() => addDays(today, 1));
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [overPanel, setOverPanel] = useState(false);
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const { toast, show, hide } = useToast();
  const nowMin = useTokyoNowMinutes();

  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const { tasks, fixedEvents, settings } = data;
  const snapMinutes = settings.snapMinutes;
  const dayFixed = useMemo(() => fixedEventsForDate(fixedEvents, viewDate), [fixedEvents, viewDate]);
  const dayTasks = useMemo(() => placedTasksForDate(tasks, viewDate), [tasks, viewDate]);
  const pool = useMemo(() => unplacedTasks(tasks), [tasks]);
  const conflicts = useMemo(() => conflictingTaskIds(tasks, fixedEvents, viewDate), [tasks, fixedEvents, viewDate]);
  const editing = editingId ? tasks.find((t) => t.id === editingId) ?? null : null;

  // 日付を切り替えたら、その日の最初の予定（なければ 7:00）付近までスクロールする
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const starts = [...dayFixed.map((e) => e.startMin), ...dayTasks.map((t) => t.startMin)];
    const first = viewDate === today && nowMin !== null ? nowMin - 60 : starts.length ? Math.min(...starts) - 30 : 7 * 60;
    el.scrollTop = Math.max(0, minutesToY(first));
    // 日付切替時だけ実行したい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  /** ポインタ位置がタイムライン／未配置パネルの上かを判定し、プレビューを計算する */
  const evaluate = useCallback(
    (pointer: { x: number; y: number }, session: DragSession) => {
      const scroller = scrollRef.current;
      const body = bodyRef.current;
      const panel = panelRef.current;
      const inRect = (r: DOMRect) => pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;

      if (panel && inRect(panel.getBoundingClientRect())) {
        return { over: "panel" as const, preview: null };
      }
      if (scroller && body && inRect(scroller.getBoundingClientRect())) {
        const startMin = pointerToStartMinutes(
          pointer.y,
          body.getBoundingClientRect().top,
          session.grabOffsetPx,
          session.durationMin,
          snapMinutes,
        );
        const check = checkPlacement(tasks, fixedEvents, viewDate, session.taskId, startMin, startMin + session.durationMin);
        return {
          over: "timeline" as const,
          preview: {
            taskId: session.taskId,
            title: session.title,
            color: session.color,
            startMin,
            durationMin: session.durationMin,
            valid: check.ok,
            message: check.ok ? null : check.message,
          },
        };
      }
      return { over: null, preview: null };
    },
    [tasks, fixedEvents, viewDate, snapMinutes],
  );

  const refresh = useCallback(() => {
    const session = sessionRef.current;
    const pointer = pointerRef.current;
    if (!session || !pointer) return;
    const result = evaluate(pointer, session);
    setPreview(result.preview);
    setOverPanel(result.over === "panel" && session.kind === "placed");
  }, [evaluate]);

  // 自動スクロール中はポインタが止まっていても時刻が変わるので、スクロールでも再計算する
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !dragSession) return;
    el.addEventListener("scroll", refresh, { passive: true });
    return () => el.removeEventListener("scroll", refresh);
  }, [dragSession, refresh]);

  const endDrag = () => {
    sessionRef.current = null;
    pointerRef.current = null;
    setDragSession(null);
    setPreview(null);
    setOverPanel(false);
  };

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={(event) => {
        const source = event.operation.source;
        const dragData = source?.data as DragData | undefined;
        const task = dragData ? tasks.find((t) => t.id === dragData.taskId) : undefined;
        if (!source || !dragData || !task) return;
        const initial = event.operation.position.initial;
        const rect = source.element?.getBoundingClientRect();
        const durationPx = task.durationMin * PX_PER_MINUTE;
        // 配置済み：掴んだ位置を保ったまま動かす。未配置：ポインタがタスク上端付近に来るようにする
        const grabOffsetPx =
          dragData.kind === "placed" && rect
            ? Math.min(Math.max(initial.y - rect.top, 0), durationPx)
            : Math.min(12, durationPx / 2);
        const session: DragSession = {
          taskId: task.id,
          kind: dragData.kind,
          grabOffsetPx,
          durationMin: task.durationMin,
          title: task.title,
          color: task.color,
        };
        sessionRef.current = session;
        pointerRef.current = { x: initial.x, y: initial.y };
        setDragSession(session);
        refresh();
      }}
      onDragMove={(event) => {
        const p = event.operation.position.current;
        pointerRef.current = { x: p.x, y: p.y };
        refresh();
      }}
      onDragEnd={(event) => {
        const session = sessionRef.current;
        if (!session || event.canceled) return endDrag();
        const p = event.operation.position.current;
        // 離した瞬間の座標で、プレビューと同じ関数を使って確定する（表示と保存がずれない）
        const result = evaluate({ x: p.x, y: p.y }, session);
        if (result.over === "timeline" && result.preview) {
          const r = actions.placeTask(session.taskId, viewDate, result.preview.startMin, session.durationMin);
          if (!r.ok) show(r.message, "error");
        } else if (result.over === "panel" && session.kind === "placed") {
          actions.unplaceTask(session.taskId);
          show("未配置に戻しました");
        }
        endDrag();
      }}
    >
      <div className="flex h-dvh flex-col bg-neutral-50/60">
        <Header date={viewDate} today={today} onChange={setViewDate} />

        {warning && (
          <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6" role="alert">
            <span className="flex-1">{warning}</span>
            <button type="button" onClick={actions.dismissWarning} className="underline">
              閉じる
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
          <TaskPanel
            panelRef={panelRef}
            tasks={pool}
            open={panelOpen}
            onToggleOpen={() => setPanelOpen((v) => !v)}
            highlight={overPanel}
            onAdd={(input) => {
              const r = actions.addTask(input);
              if (r.ok) show("未配置タスクに追加しました");
              return r;
            }}
            onOpenTask={setEditingId}
            onToggleDone={actions.toggleDone}
          />

          <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
            <DaySummary
              placedCount={dayTasks.length}
              placedMinutes={dayTasks.reduce((s, t) => s + t.durationMin, 0)}
              fixedCount={dayFixed.length}
              conflictCount={conflicts.size}
              snapMinutes={snapMinutes}
            />
            <div className="min-h-0 flex-1">
              <Timeline
                scrollRef={scrollRef}
                bodyRef={bodyRef}
                tasks={dayTasks}
                fixedEvents={dayFixed}
                conflictIds={conflicts}
                preview={preview}
                draggingTaskId={dragSession?.taskId ?? null}
                nowMin={viewDate === today ? nowMin : null}
                snapMinutes={snapMinutes}
                onOpenTask={setEditingId}
                onToggleDone={actions.toggleDone}
                onResize={(id, durationMin) => {
                  const t = tasks.find((x) => x.id === id);
                  if (!t || t.startMin === null || t.date === null) return;
                  const r = actions.placeTask(id, t.date, t.startMin, durationMin);
                  if (!r.ok) show(r.message, "error");
                }}
                validate={(id, s, e) => checkPlacement(tasks, fixedEvents, viewDate, id, s, e)}
              />
            </div>
          </main>
        </div>
      </div>

      {/* ポインタに付いてくるカード。タイムライン上ではプレビュー枠を見せるため薄くする */}
      <DragOverlay dropAnimation={null}>
        {() =>
          dragSession ? (
            <div className={`transition-opacity ${preview ? "opacity-0" : "opacity-100"}`}>
              <DragChip task={tasks.find((t) => t.id === dragSession.taskId)!} />
            </div>
          ) : null
        }
      </DragOverlay>

      {editing && (
        <TaskDialog
          key={editing.id}
          task={editing}
          viewDate={viewDate}
          tasks={tasks}
          fixedEvents={fixedEvents}
          onClose={() => setEditingId(null)}
          notify={show}
        />
      )}
      <Toast toast={toast} onClose={hide} />
    </DragDropProvider>
  );
}

function DaySummary({
  placedCount,
  placedMinutes,
  fixedCount,
  conflictCount,
  snapMinutes,
}: {
  placedCount: number;
  placedMinutes: number;
  fixedCount: number;
  conflictCount: number;
  snapMinutes: number;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-100 px-4 py-2 text-xs text-neutral-500 sm:px-6">
      <span>
        タスク <b className="font-semibold tabular-nums text-neutral-800">{placedCount}</b>件
        {placedMinutes > 0 && <span className="tabular-nums">（{formatDuration(placedMinutes)}）</span>}
      </span>
      <span>
        固定予定 <b className="font-semibold tabular-nums text-neutral-800">{fixedCount}</b>件
      </span>
      {conflictCount > 0 && <span className="font-semibold text-rose-600">重複 {conflictCount}件</span>}
      <span className="ml-auto text-neutral-400">{snapMinutes}分刻み</span>
    </div>
  );
}

