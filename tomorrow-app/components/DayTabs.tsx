export type Day = "today" | "tomorrow";

interface Props {
  value: Day;
  onChange: (day: Day) => void;
  labels: Record<Day, string>;
}

const DAYS: Day[] = ["today", "tomorrow"];
const NAMES: Record<Day, string> = { today: "今日", tomorrow: "明日" };

export function DayTabs({ value, onChange, labels }: Props) {
  return (
    <div className="mb-4 grid grid-cols-2 rounded-lg border border-neutral-200 bg-white p-1" role="tablist" aria-label="表示する日">
      {DAYS.map((d) => (
        <button
          key={d}
          type="button"
          role="tab"
          aria-selected={value === d}
          onClick={() => onChange(d)}
          className={`rounded-md py-2 text-sm transition ${
            value === d ? "bg-neutral-900 font-medium text-white" : "text-neutral-500 hover:bg-neutral-100"
          }`}
        >
          {NAMES[d]}
          {labels[d] && <span className={`ml-1.5 text-xs ${value === d ? "text-neutral-300" : "text-neutral-400"}`}>{labels[d]}</span>}
        </button>
      ))}
    </div>
  );
}
