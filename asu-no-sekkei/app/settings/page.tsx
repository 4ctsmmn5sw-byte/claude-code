import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/SettingsView";

export const metadata: Metadata = { title: "固定予定・設定 | 明日の設計" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center text-sm text-neutral-400">読み込み中…</div>}>
      <SettingsView />
    </Suspense>
  );
}
