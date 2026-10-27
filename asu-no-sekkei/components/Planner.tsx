"use client";

import { AutoScroller, PointerActivationConstraints } from "@dnd-kit/dom";
import { DragDropProvider, DragOverlay, PointerSensor } from "@dnd-kit/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTokyoNowMinutes, useTokyoToday } from "@/hooks/useTokyoClock";
import { useToast } from "@/hooks/useToast";
import { addDays, formatDateLabel } from "@/lib/date";
import {
  checkPlacement,
  conflictingTaskIds,
  fixedEventsForDate,
  overlaps,
  placedTasksForDate,
  skippedFixedEventsForDate,
  unplacedTasks,
} from "@/lib/schedule";
import { actions, useAppStore } from "@/lib/store";
import { anchoredScrollTop, clamp, DAY_MINUTES, formatMinutes, pointerToStartMinutes, ZOOM_LEVELS } from "@/lib/time";
import type { AppData, DateKey, FixedEvent } from "@/lib/types";
import { AddTaskSheet } from "./AddTaskSheet";
import { AppNav } from "./AppNav";
import { toggleDoneWithPrompt } from "./taskDone";
import { FixedEventSheet } from "./FixedEventSheet";
import { Header } from "./Header";
import { TaskDialog } from "./TaskDialog";
import { CompletionSheet } from "./goals/CompletionSheet";
import { DragChip, PEEK_HEIGHT, TaskSheet, type SheetMode } from "./TaskSheet";
import { Timeline, type DragPreview } from "./Timeline";
import type { DragData } from "./TimelineTaskBlock";
import { Toast } from "./Toast";

/** 長押しでドラッグを始めるまでの時間（ms） */
export const LONG_PRESS_MS = 300;
/** 長押し中にこれ以上指が動いたらスクロールとみなす（px） */
const LONG_PRESS_TOLERANCE = 8;
/** 自動スクロールが始まる、表示領域の上下端からの距離（px） */
const EDGE_ZONE = 64;
const MAX_SCROLL_SPEED = 18;

/**
 * 入力の種類ごとにドラッグ開始条件を変える。
 * - タッチ：約 300ms の長押しで開始。それまでに指が動けば通常の上下スクロール
 * - マウス／ペン：4px 動かしたら開始（クリックは選択・編集として扱える）
 */
const sensors = [
  PointerSensor.configure({
    activationConstraints(event) {
      if (event.pointerType === "touch") {
        return [new PointerActivationConstraints.Delay({ value: LONG_PRESS_MS, tolerance: LONG_PRESS_TOLERANCE })];
      }
      return [new PointerActivationConstraints.Distance({ value: 4 })];
    },
  }),
];

/** 自動スクロールは下部シートを考慮して自前で行うため、dnd-kit 標準の AutoScroller は外す */
const withoutAutoScroller = <T,>(defaults: T[]): T[] =>
  defaults.filter((p) => p !== (AutoScroller as unknown) && (p as { plugin?: unknown }).plugin !== AutoScroller);

interface DragSession {
  taskId: string;
  kind: DragData["kind"];
  /** 掴んだ位置からタスク上端までの距離（px） */
  grabOffsetPx: number;
  durationMin: number;
  title: string;
  color: string;
  /** ドラッグ開始前のシートの状態（キャンセル時に戻す） */
  sheetBefore: SheetMode;
}

type Over = "timeline" | "sheet" | null;

/** 設定画面などから戻ったときに表示中の日付を保つ（再読み込みでは初期表示に戻る）。画面ごとに別 */
const rememberedDates: Partial<Record<PlannerMode, { date: DateKey; today: DateKey }>> = {};

/** plan：計画（初期表示は明日）／today：実行（初期表示は今日） */
export type PlannerMode = "plan" | "today";

export function Planner({ mode = "plan" }: { mode?: PlannerMode }) {
  const store = useAppStore();
  const today = useTokyoToday();

  if (!store || !today) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-neutral-400" aria-busy="true">
        読み込み中…
      </div>
    );
  }
  return <PlannerView data={store.data} warning={store.warning} today={today} mode={mode} />;
}

function PlannerView({ data, warning, today, mode }: { data: AppData; warning: string | null; today: DateKey; mode: PlannerMode }) {
  const router = useRouter();
  const [viewDate, setViewDateState] = useState<DateKey>(() => {
    const remembered = rememberedDates[mode];
    if (remembered && remembered.today === today) return remembered.date;
    return mode === "today" ? today : addDays(today, 1);
  });
  const setViewDate = (d: DateKey) => {
    rememberedDates[mode] = { date: d, today };
    setViewDateState(d);
  };
  const [sheetMode, setSheetMode] = useState<SheetMode>("peek");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [fixedMenu, setFixedMenu] = useState<{ event: FixedEvent; skipped: boolean } | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [flash, setFlash] = useState<DragPreview | null>(null);
  const [over, setOver] = useState<Over>(null);
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [mainHeight, setMainHeight] = useState(600);
  const { toast, show, hide } = useToast();
  // 目標のタスクを完了したときの「実績時間の確認」
  const [completingId, setCompletingId] = useState<string | null>(null);
  const nowMin = useTokyoNowMinutes();

  const mainRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const zoomAnchor = useRef<{ min: number; offset: number } | null>(null);

  const { tasks, fixedEvents, settings } = data;
  const { snapMinutes, pxPerMinute: ppm } = settings;
  const dayFixed = useMemo(() => fixedEventsForDate(fixedEvents, viewDate), [fixedEvents, viewDate]);
  const daySkipped = useMemo(() => skippedFixedEventsForDate(fixedEvents, viewDate), [fixedEvents, viewDate]);
  const dayTasks = useMemo(() => placedTasksForDate(tasks, viewDate), [tasks, viewDate]);
  const pool = useMemo(() => unplacedTasks(tasks), [tasks]);
  const goalTitles = useMemo(() => new Map(data.goals.map((g) => [g.id, g.title])), [data.goals]);
  const conflicts = useMemo(() => conflictingTaskIds(tasks, fixedEvents, viewDate), [tasks, fixedEvents, viewDate]);
  const editing = editingId ? tasks.find((t) => t.id === editingId) ?? null : null;
  const selected = selectedId ? dayTasks.find((t) => t.id === selectedId) ?? null : null;
  const placing = placingId ? pool.find((t) => t.id === placingId) ?? null : null;
  const openHeight = Math.max(PEEK_HEIGHT, Math.min(mainHeight * 0.62, mainHeight - 140));

  // 下部シートの開いた高さを画面の高さから決める
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMainHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bodyOffsetInScroll = () => {
    const s = scrollRef.current!;
    return bodyRef.current!.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop;
  };

  /**
   * 日付を切り替えたら、その日の主な予定が見やすい位置までスクロールする。
   * 予定のまとまりが画面に収まるなら全体を中央に、収まらなければ最初の予定の少し前を上端に。
   * 今日を表示しているときは現在時刻の少し前から。予定がなければ 8:00 から。
   */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !bodyRef.current) return;
    const visible = el.clientHeight - PEEK_HEIGHT;
    const items = [
      ...dayFixed.map((e) => [e.startMin, e.endMin]),
      ...dayTasks.map((t) => [t.startMin, t.startMin + t.durationMin]),
    ];
    let topMin: number;
    if (viewDate === today && nowMin !== null) {
      topMin = nowMin - 60;
    } else if (items.length > 0) {
      const first = Math.min(...items.map((i) => i[0]));
      const last = Math.max(...items.map((i) => i[1]));
      const spanPx = (last - first) * ppm;
      topMin = spanPx + 60 * ppm <= visible ? (first + last) / 2 - visible / 2 / ppm : first - 30;
    } else {
      topMin = 8 * 60;
    }
    el.scrollTop = Math.max(0, bodyOffsetInScroll() + clamp(topMin, 0, DAY_MINUTES) * ppm);
    // 日付切替時だけ実行したい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  // 表示倍率を変えても、画面中央の時刻が同じ位置に残るようにする
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = zoomAnchor.current;
    if (!el || !anchor || !bodyRef.current) return;
    zoomAnchor.current = null;
    el.scrollTop = anchoredScrollTop(anchor.min, anchor.offset, bodyOffsetInScroll(), ppm);
  }, [ppm]);

  const zoomIndex = ZOOM_LEVELS.indexOf(ppm as (typeof ZOOM_LEVELS)[number]);
  const zoom = (dir: 1 | -1) => {
    const next = ZOOM_LEVELS[zoomIndex + dir];
    const el = scrollRef.current;
    if (!next || !el) return;
    const offset = (el.clientHeight - PEEK_HEIGHT) / 2;
    zoomAnchor.current = { min: (el.scrollTop + offset - bodyOffsetInScroll()) / ppm, offset };
    actions.updateSettings({ pxPerMinute: next });
  };

  /** ポインタ位置がタイムライン／下部シートの上かを判定し、プレビューを計算する */
  const evaluate = useCallback(
    (pointer: { x: number; y: number }, session: DragSession): { over: Over; preview: DragPreview | null } => {
      const scroller = scrollRef.current;
      const body = bodyRef.current;
      const sheet = sheetRef.current;
      const inRect = (r: DOMRect) => pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;

      if (sheet && inRect(sheet.getBoundingClientRect())) return { over: "sheet", preview: null };
      if (scroller && body && inRect(scroller.getBoundingClientRect())) {
        const startMin = pointerToStartMinutes(
          pointer.y,
          body.getBoundingClientRect().top,
          session.grabOffsetPx,
          session.durationMin,
          snapMinutes,
          ppm,
        );
        const check = checkPlacement(tasks, fixedEvents, viewDate, session.taskId, startMin, startMin + session.durationMin);
        return {
          over: "timeline",
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
    [tasks, fixedEvents, viewDate, snapMinutes, ppm],
  );

  const refresh = useCallback(() => {
    const session = sessionRef.current;
    const pointer = pointerRef.current;
    if (!session || !pointer) return;
    const result = evaluate(pointer, session);
    setPreview(result.preview);
    setOver(result.over);
  }, [evaluate]);

  // 自動スクロール中はポインタが止まっていても時刻が変わるので、スクロールでも再計算する
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !dragSession) return;
    el.addEventListener("scroll", refresh, { passive: true });
    return () => el.removeEventListener("scroll", refresh);
  }, [dragSession, refresh]);

  /**
   * ドラッグ中、指が表示領域の上下端に近づいたらタイムラインを自動スクロールする。
   * 下端は「下部シートの上端」を基準にする（シートに隠れた部分へは置けないため）。
   */
  useEffect(() => {
    if (!dragSession) return;
    let raf = 0;
    // 下部シートから掴んだ直後は指が下端付近にあるので、一度でも端から離れるまでは自動スクロールしない
    let armed = false;
    const tick = () => {
      const el = scrollRef.current;
      const p = pointerRef.current;
      if (el && p) {
        const r = el.getBoundingClientRect();
        const sheetTop = sheetRef.current?.getBoundingClientRect().top ?? r.bottom;
        const top = r.top;
        const bottom = Math.min(r.bottom, sheetTop);
        if (p.y > top + EDGE_ZONE && p.y < bottom - EDGE_ZONE) armed = true;
        let v = 0;
        if (!armed) {
          raf = requestAnimationFrame(tick);
          return;
        }
        if (p.y < top + EDGE_ZONE) v = -MAX_SCROLL_SPEED * Math.min(1, (top + EDGE_ZONE - p.y) / EDGE_ZONE);
        else if (p.y > bottom - EDGE_ZONE && p.y <= bottom) v = MAX_SCROLL_SPEED * Math.min(1, (p.y - (bottom - EDGE_ZONE)) / EDGE_ZONE);
        if (v !== 0) el.scrollTop += v;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragSession]);

  const endDrag = (restoreSheet: boolean) => {
    const session = sessionRef.current;
    if (session && restoreSheet) setSheetMode(session.sheetBefore);
    sessionRef.current = null;
    pointerRef.current = null;
    setDragSession(null);
    setPreview(null);
    setOver(null);
  };

  // 赤い「置けない」表示は少しだけ残して消す
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(id);
  }, [flash]);

  // Esc でタップ配置・選択を解除
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || editingId || adding || fixedMenu) return;
      setPlacingId(null);
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId, adding, fixedMenu]);

  /** タップで配置：選択中の未配置タスクを、タップした時刻（刻みで切り捨て）から置く */
  const placeAtTap = (clientY: number) => {
    if (!placing || !bodyRef.current) return;
    const raw = (clientY - bodyRef.current.getBoundingClientRect().top) / ppm;
    const startMin = clamp(Math.floor(raw / snapMinutes) * snapMinutes, 0, DAY_MINUTES - placing.durationMin);
    const end = startMin + placing.durationMin;
    const r = actions.placeTask(placing.id, viewDate, startMin, placing.durationMin);
    if (r.ok) {
      setPlacingId(null);
      setSelectedId(placing.id);
      show(`${formatMinutes(startMin)}–${formatMinutes(end)}に配置しました`);
    } else {
      // 重なる場合は勝手に別の時刻へずらさず、赤く示して配置しない
      setFlash({ taskId: placing.id, title: placing.title, color: placing.color, startMin, durationMin: placing.durationMin, valid: false, message: r.message });
      show(r.message, "error");
    }
  };


  const topBar = placing ? (
    <div className="flex flex-1 items-center gap-2 pl-5 pr-2" data-testid="placing-bar">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-neutral-900">「{placing.title}」{placing.durationMin}分</div>
        <div className="text-xs text-neutral-500">置きたい開始時刻をタップ</div>
      </div>
      <button type="button" onClick={() => setPlacingId(null)} className="h-11 shrink-0 rounded-xl px-4 text-sm font-medium text-neutral-700 ring-1 ring-neutral-200 active:bg-neutral-100">
        キャンセル
      </button>
    </div>
  ) : selected ? (
    <div className="flex flex-1 items-center gap-0.5 pl-5 pr-1" data-testid="selected-bar">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-neutral-900">{selected.title}</div>
        <div className="text-xs tabular-nums text-neutral-500">
          {formatMinutes(selected.startMin)}–{formatMinutes(selected.startMin + selected.durationMin)}（{selected.durationMin}分）
        </div>
      </div>
      <BarButton label="編集" onClick={() => setEditingId(selected.id)} icon="M4 14.5V16h1.5l8-8L12 6.5l-8 8ZM13.5 5 15 6.5" />
      <BarButton
        label={selected.done ? "未完了" : "完了"}
        onClick={() => toggleDoneWithPrompt(selected.id, show, setCompletingId)}
        icon="m4.5 10.5 3.5 3.5 7.5-8"
      />
      <BarButton
        label="未配置へ"
        onClick={() => {
          actions.unplaceTask(selected.id);
          setSelectedId(null);
          show("未配置に戻しました");
        }}
        icon="M10 4v9m0 0-3.5-3.5M10 13l3.5-3.5M4.5 16h11"
      />
      <BarButton label="閉じる" onClick={() => setSelectedId(null)} icon="m6 6 8 8M14 6l-8 8" />
    </div>
  ) : null;

  const dragHint =
    dragSession && (preview || over !== "timeline")
      ? preview
        ? preview.valid
          ? `${formatMinutes(preview.startMin)} – ${formatMinutes(preview.startMin + preview.durationMin)}（${preview.durationMin}分）`
          : `${formatMinutes(preview.startMin)} – ${formatMinutes(preview.startMin + preview.durationMin)} 重なるため配置できません`
        : over === "sheet" && dragSession.kind === "placed"
          ? "ここで離すと未配置に戻します"
          : "ここで離すとキャンセルして元に戻します"
      : null;

  return (
    <DragDropProvider
      sensors={sensors}
      plugins={withoutAutoScroller}
      onDragStart={(event) => {
        const source = event.operation.source;
        const dragData = source?.data as DragData | undefined;
        const task = dragData ? tasks.find((t) => t.id === dragData.taskId) : undefined;
        if (!source || !dragData || !task) return;
        const initial = event.operation.position.initial;
        const rect = source.element?.getBoundingClientRect();
        const durationPx = task.durationMin * ppm;
        // 配置済み：掴んだ位置を保ったまま動かす。未配置：指がタスク上端付近に来るようにする
        const grabOffsetPx =
          dragData.kind === "placed" && rect
            ? Math.min(Math.max(initial.y - rect.top, 0), durationPx)
            : Math.min(16, durationPx / 2);
        const session: DragSession = {
          taskId: task.id,
          kind: dragData.kind,
          grabOffsetPx,
          durationMin: task.durationMin,
          title: task.title,
          color: task.color,
          sheetBefore: sheetMode,
        };
        sessionRef.current = session;
        pointerRef.current = { x: initial.x, y: initial.y };
        setDragSession(session);
        setPlacingId(null);
        if (dragData.kind === "placed") setSelectedId(task.id);
        // 未配置タスクを掴んだら一覧を縮めてタイムラインを広く見せる
        if (dragData.kind === "unplaced") setSheetMode("peek");
        if (event.operation.activatorEvent instanceof PointerEvent && event.operation.activatorEvent.pointerType === "touch") {
          navigator.vibrate?.(12);
        }
        refresh();
      }}
      onDragMove={(event) => {
        // dragmove は位置を更新する前に発火するので、移動先は event.to を使う（position.current は 1 つ前の位置）
        const p = event.to ?? event.operation.position.current;
        pointerRef.current = { x: p.x, y: p.y };
        refresh();
      }}
      onDragEnd={(event) => {
        const session = sessionRef.current;
        if (!session || event.canceled) return endDrag(true);
        // 最後にプレビューを計算した座標を、プレビューと同じ関数で確定する（表示と保存がずれない）
        const p = pointerRef.current ?? event.operation.position.current;
        const result = evaluate({ x: p.x, y: p.y }, session);
        if (result.over === "timeline" && result.preview) {
          const r = actions.placeTask(session.taskId, viewDate, result.preview.startMin, session.durationMin);
          if (!r.ok) {
            // 重なる・範囲外：保存せず元の位置に戻す（勝手に別の時刻へずらさない）
            show(r.message, "error");
            return endDrag(true);
          }
          setSelectedId(session.taskId);
          return endDrag(false);
        }
        if (result.over === "sheet" && session.kind === "placed") {
          actions.unplaceTask(session.taskId);
          setSelectedId(null);
          show("未配置に戻しました");
          return endDrag(false);
        }
        endDrag(true);
      }}
    >
      <div className="mx-auto flex h-dvh max-w-[520px] flex-col bg-white sm:border-x sm:border-neutral-200">
        <Header
          date={viewDate}
          today={today}
          onChange={(d) => {
            setViewDate(d);
            setSelectedId(null);
          }}
          ppm={ppm}
          canZoomIn={zoomIndex < ZOOM_LEVELS.length - 1}
          canZoomOut={zoomIndex > 0}
          onZoom={zoom}
        />

        {warning && (
          <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 text-xs text-amber-900" role="alert">
            <span className="flex-1 py-2">{warning}</span>
            <button type="button" onClick={actions.dismissWarning} className="h-11 px-2 underline">
              閉じる
            </button>
          </div>
        )}

        <div ref={mainRef} className="relative min-h-0 flex-1">
          <Timeline
            scrollRef={scrollRef}
            bodyRef={bodyRef}
            ppm={ppm}
            bottomPad={PEEK_HEIGHT}
            tasks={dayTasks}
            fixedEvents={dayFixed}
            skippedFixed={daySkipped}
            conflictIds={conflicts}
            preview={preview ?? flash}
            draggingTaskId={dragSession?.taskId ?? null}
            selectedTaskId={selectedId}
            placing={placing !== null}
            nowMin={viewDate === today ? nowMin : null}
            snapMinutes={snapMinutes}
            onTapTask={(id) => {
              if (selectedId === id) setEditingId(id);
              else {
                setSelectedId(id);
                setSheetMode("peek");
              }
            }}
            onTapFixed={(event, skipped) => setFixedMenu({ event, skipped })}
            onTapBackground={(y) => (placing ? placeAtTap(y) : setSelectedId(null))}
            onResize={(id, durationMin) => {
              const t = tasks.find((x) => x.id === id);
              if (!t || t.startMin === null || t.date === null) return;
              const r = actions.placeTask(id, t.date, t.startMin, durationMin);
              if (!r.ok) show(r.message, "error");
            }}
            validate={(id, s, e) => checkPlacement(tasks, fixedEvents, viewDate, id, s, e)}
          />

          {/* ドラッグ中は開始・終了時刻を常に上部に表示 */}
          {dragHint && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-50 flex justify-center px-4">
              <div
                data-testid="drag-hint"
                className={`rounded-full px-4 py-2 text-sm font-semibold tabular-nums text-white shadow-lg ${
                  preview && !preview.valid ? "bg-rose-600" : "bg-neutral-900"
                }`}
              >
                {dragHint}
              </div>
            </div>
          )}

          <TaskSheet
            sheetRef={sheetRef}
            tasks={pool}
            onAdd={() => setAdding(true)}
            goalTitles={goalTitles}
            mode={placing || selected ? "peek" : sheetMode}
            openHeight={openHeight}
            onModeChange={(m) => {
              // 一覧を開くときは選択・タップ配置を解除する
              if (m === "open") {
                setSelectedId(null);
                setPlacingId(null);
              }
              setSheetMode(m);
            }}
            topBar={topBar}
            highlight={over === "sheet" && dragSession?.kind === "placed"}
            onTapTask={(id) => {
              setSelectedId(null);
              setPlacingId(id);
              setSheetMode("peek");
            }}
            onEditTask={setEditingId}
            onToggleDone={(id) => toggleDoneWithPrompt(id, show, setCompletingId)}
          />
        </div>

        <AppNav active={mode === "today" ? "today" : "plan"} />
      </div>

      {/* 指に付いてくるカード。タイムライン上ではプレビュー枠を見せるため消す */}
      <DragOverlay dropAnimation={null}>
        {() => {
          const t = dragSession ? tasks.find((x) => x.id === dragSession.taskId) : undefined;
          return t ? (
            <div className={`transition-opacity ${preview ? "opacity-0" : "opacity-100"}`}>
              <DragChip task={t} />
            </div>
          ) : null;
        }}
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
          onCompleted={setCompletingId}
          link={
            editing.goalId && goalTitles.has(editing.goalId)
              ? {
                  goalId: editing.goalId,
                  goal: goalTitles.get(editing.goalId)!,
                  step: data.goalSteps.find((s) => s.id === editing.stepId)?.title ?? null,
                }
              : undefined
          }
        />
      )}
      {completingId && (
        <CompletionSheet
          taskId={completingId}
          onClose={() => setCompletingId(null)}
          onSaved={(message) => {
            setCompletingId(null);
            show(message);
          }}
        />
      )}
      {adding && (
        <AddTaskSheet
          onClose={() => setAdding(false)}
          onAdd={(input) => {
            const r = actions.addTask(input);
            if (r.ok) setSheetMode("open");
            return r;
          }}
        />
      )}
      {fixedMenu && (
        <FixedEventSheet
          event={fixedMenu.event}
          date={viewDate}
          skipped={fixedMenu.skipped}
          onClose={() => setFixedMenu(null)}
          onSkip={() => {
            const id = fixedMenu.event.id;
            actions.skipFixedEventOn(id, viewDate);
            setFixedMenu(null);
            show("この日だけ休みにしました", "info", { label: "元に戻す", run: () => actions.unskipFixedEventOn(id, viewDate) });
          }}
          onUnskip={() => {
            const e = fixedMenu.event;
            // 休みの間に入れたタスクと重なる場合も、タスクは動かさず警告だけ出す
            const clash = dayTasks.filter((t) => overlaps(e.startMin, e.endMin, t.startMin, t.startMin + t.durationMin));
            actions.unskipFixedEventOn(e.id, viewDate);
            setFixedMenu(null);
            if (clash.length > 0) {
              show(`休みを取り消しました。「${clash.map((t) => t.title).join("」「")}」と重なっています（タスクはそのままです）`, "error");
            } else {
              show("休みを取り消しました");
            }
          }}
          onEditWeekly={() => router.push(`/settings?edit=${encodeURIComponent(fixedMenu.event.id)}`)}
          onEndRepeat={(lastDate) => {
            const id = fixedMenu.event.id;
            const r = actions.endFixedEventRepeat(id, lastDate);
            setFixedMenu(null);
            if (!r.ok) return show(r.message, "error");
            const previous = r.previousValidTo ?? null;
            show(`毎週の繰り返しを${formatDateLabel(lastDate)}までで終了しました`, "info", {
              label: "元に戻す",
              run: () => actions.setFixedEventValidTo(id, previous),
            });
          }}
        />
      )}
      <Toast toast={toast} onClose={hide} />
    </DragDropProvider>
  );
}

function BarButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] text-neutral-600 active:bg-neutral-100"
    >
      <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d={icon} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
