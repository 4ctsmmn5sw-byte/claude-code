import type { SlotStatus } from "@/lib/todayPlan";

const BASE = "rounded px-1.5 py-px";

export function StatusBadge({ status }: { status: SlotStatus }) {
  switch (status.kind) {
    case "done":
      return <span className={`${BASE} bg-neutral-100 text-neutral-500`}>完了{status.at && ` ${status.at}`}</span>;
    case "late":
      return <span className={`${BASE} border border-red-200 bg-red-50 text-red-700`}>遅れ {status.minutes}分</span>;
    case "doing":
      return <span className={`${BASE} bg-neutral-900 text-white`}>進行中</span>;
    case "planned":
      return <span className={`${BASE} border border-neutral-200 text-neutral-500`}>予定</span>;
    case "unscheduled":
      return <span className={`${BASE} border border-dashed border-neutral-300 text-neutral-500`}>時間外</span>;
  }
}
