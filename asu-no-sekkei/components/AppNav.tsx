"use client";

import Link from "next/link";

export type AppSection = "goals" | "plan" | "today" | "review";

const ITEMS: { key: AppSection; href: string; label: string; icon: string }[] = [
  { key: "goals", href: "/goals", label: "目標", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" },
  { key: "plan", href: "/", label: "計画", icon: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 5h16M9 3v4m6-4v4" },
  { key: "today", href: "/today", label: "実行", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-9.5 2.2 2.2L15.5 9.5" },
  { key: "review", href: "/review", label: "振り返り", icon: "M4 19h16M7 16V11m5 5V7m5 9v-6" },
];

/**
 * 画面最下部の主要な画面の切り替え（目標・計画・実行・振り返り）。
 * iPhone のホームインジケーターと重ならないよう safe-area-inset-bottom 分の余白を取る。
 */
export function AppNav({ active }: { active: AppSection }) {
  return (
    <nav
      className="relative z-50 shrink-0 border-t border-neutral-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      aria-label="メイン操作"
    >
      <div className="grid grid-cols-4">
        {ITEMS.map((it) => {
          const on = it.key === active;
          return (
            <Link
              key={it.key}
              href={it.href}
              aria-current={on ? "page" : undefined}
              className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                on ? "text-neutral-900" : "text-neutral-400 active:text-neutral-600"
              }`}
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={on ? 1.9 : 1.6} aria-hidden>
                <path d={it.icon} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
