import { formatJaDate } from "@/lib/date";

interface Props {
  /** 表示中の日。進捗はこの日のタスクの値 */
  day: "today" | "tomorrow";
  today: Date | null;
  tomorrow: Date | null;
  completed: number;
  total: number;
}

export function SummaryCard({ day, today, tomorrow, completed, total }: Props) {
  const dateClass = (active: boolean) => `mt-1 font-medium ${active ? "text-neutral-900" : "text-neutral-400"}`;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-neutral-400">今日</dt>
          <dd className={dateClass(day === "today")}>{today ? formatJaDate(today) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">明日</dt>
          <dd className={dateClass(day === "tomorrow")}>{tomorrow ? formatJaDate(tomorrow) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">進捗（{day === "today" ? "今日" : "明日"}）</dt>
          <dd className="mt-1 font-medium tabular-nums text-neutral-900">
            {completed} / {total} 完了
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="進捗率"
        >
          <div className="h-full rounded-full bg-neutral-900 transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <span className="w-10 text-right text-xs tabular-nums text-neutral-500">{percent}%</span>
      </div>
    </section>
  );
}
