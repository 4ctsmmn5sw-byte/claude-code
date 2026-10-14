import type { Metadata } from "next";
import { ReviewView } from "@/components/review/ReviewView";

export const metadata: Metadata = { title: "振り返り | 明日の設計" };

export default function ReviewPage() {
  return <ReviewView />;
}
