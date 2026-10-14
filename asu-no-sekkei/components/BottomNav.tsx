"use client";

/**
 * 画面最下部の操作領域。「予定」「タスク」の切り替えと中央の追加ボタン。
 * iPhone のホームインジケーターと重ならないよう safe-area-inset-bottom 分の余白を取る。
 */
export function BottomNav({
  active,
  taskCount,
  onSchedule,
  onTasks,
  onAdd,
}: {
  active: "schedule" | "tasks";
  taskCount: number;
  onSchedule: () => void;
  onTasks: () => void;
  onAdd: () => void;
}) {
  const tab = (on: boolean) =>
    `flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
      on ? "text-neutral-900" : "text-neutral-400"
    }`;
  return (
    <nav
      className="relative z-50 shrink-0 border-t border-neutral-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      aria-label="メイン操作"
    >
      <div className="flex items-center px-4">
        <button type="button" className={tab(active === "schedule")} onClick={onSchedule} aria-pressed={active === "schedule"} aria-label="予定（タイムライン）">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
            <rect x="4" y="5" width="16" height="15" rx="3" />
            <path d="M4 10h16M9 3v4M15 3v4" strokeLinecap="round" />
          </svg>
          予定
        </button>
        <div className="flex w-24 justify-center">
          <button
            type="button"
            onClick={onAdd}
            aria-label="タスクを追加"
            className="grid size-12 place-items-center rounded-full bg-neutral-900 text-white shadow-md shadow-neutral-900/20 transition active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <button type="button" className={tab(active === "tasks")} onClick={onTasks} aria-pressed={active === "tasks"} aria-label={`タスク一覧（未配置${taskCount}件）`}>
          <span className="relative">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <path d="M9 6h11M9 12h11M9 18h11" strokeLinecap="round" />
              <circle cx="4.5" cy="6" r="1.2" fill="currentColor" />
              <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
              <circle cx="4.5" cy="18" r="1.2" fill="currentColor" />
            </svg>
            {taskCount > 0 && (
              <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-neutral-900 px-1 text-center text-[10px] leading-4 text-white">
                {taskCount}
              </span>
            )}
          </span>
          タスク
        </button>
      </div>
    </nav>
  );
}
