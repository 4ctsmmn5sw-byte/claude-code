/**
 * 色はキーで保存し、表示時に実際の色へ解決する（テーマ変更やクラウド移行で値を変えずに済む）。
 * タスクは明るい色、固定予定は落ち着いた色＋斜線で、ひと目で区別できるようにしている。
 */
export interface ColorDef {
  key: string;
  label: string;
  /** 背景 */
  bg: string;
  /** 左の帯・アクセント */
  accent: string;
  /** 文字 */
  text: string;
}

export const TASK_COLORS: ColorDef[] = [
  { key: "blue", label: "青", bg: "#e8f0fe", accent: "#3b82f6", text: "#1e3a8a" },
  { key: "green", label: "緑", bg: "#e7f6ec", accent: "#22a35a", text: "#14532d" },
  { key: "amber", label: "黄", bg: "#fdf3dc", accent: "#e0a100", text: "#713f12" },
  { key: "rose", label: "赤", bg: "#fde8ec", accent: "#e5486b", text: "#881337" },
  { key: "violet", label: "紫", bg: "#f0eafd", accent: "#8b5cf6", text: "#4c1d95" },
  { key: "teal", label: "青緑", bg: "#e2f5f3", accent: "#14a39a", text: "#134e4a" },
];

export const FIXED_COLORS: ColorDef[] = [
  { key: "slate", label: "グレー", bg: "#eef0f3", accent: "#64748b", text: "#334155" },
  { key: "stone", label: "ベージュ", bg: "#f1efeb", accent: "#8a8076", text: "#44403c" },
  { key: "indigo", label: "藍", bg: "#e9ebf5", accent: "#5b63a8", text: "#312e81" },
  { key: "olive", label: "オリーブ", bg: "#eef0e4", accent: "#7c8448", text: "#3f4220" },
];

export const DEFAULT_TASK_COLOR = TASK_COLORS[0].key;
export const DEFAULT_FIXED_COLOR = FIXED_COLORS[0].key;

export function taskColor(key: string): ColorDef {
  return TASK_COLORS.find((c) => c.key === key) ?? TASK_COLORS[0];
}

export function fixedColor(key: string): ColorDef {
  return FIXED_COLORS.find((c) => c.key === key) ?? FIXED_COLORS[0];
}

/** タスクを毎週の固定予定にするときの初期色（タスクの色に近い、落ち着いた色） */
const TASK_TO_FIXED: Record<string, string> = {
  blue: "indigo",
  violet: "indigo",
  green: "olive",
  teal: "slate",
  amber: "stone",
  rose: "stone",
};

export function fixedColorForTask(taskColorKey: string): string {
  return TASK_TO_FIXED[taskColorKey] ?? DEFAULT_FIXED_COLOR;
}
