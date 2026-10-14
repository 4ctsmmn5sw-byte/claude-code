import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalsView } from "@/components/goals/GoalsView";

export const metadata: Metadata = { title: "目標 | 明日の設計" };

export default function GoalsPage() {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center text-sm text-neutral-400">読み込み中…</div>}>
      <GoalsView />
    </Suspense>
  );
}
