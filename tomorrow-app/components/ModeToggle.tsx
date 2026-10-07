export type Mode = "list" | "schedule";

const MODES: { value: Mode; label: string }[] = [
  { value: "list", label: "一覧" },
  { value: "schedule", label: "スケジュール" },
];

export function ModeToggle({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-md border border-neutral-200 bg-white p-0.5" role="tablist" aria-label="表示切り替え">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="tab"
          aria-selected={value === m.value}
          onClick={() => onChange(m.value)}
          className={`rounded px-3 py-1 text-xs transition ${
            value === m.value ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
