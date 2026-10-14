import type { Metadata } from "next";
import { SettingsView } from "@/components/SettingsView";

export const metadata: Metadata = { title: "固定予定・設定 | 明日の設計" };

export default function SettingsPage() {
  return <SettingsView />;
}
