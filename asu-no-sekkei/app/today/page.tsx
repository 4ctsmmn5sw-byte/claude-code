import type { Metadata } from "next";
import { Planner } from "@/components/Planner";

export const metadata: Metadata = { title: "実行 | 明日の設計" };

export default function TodayPage() {
  return <Planner mode="today" />;
}
