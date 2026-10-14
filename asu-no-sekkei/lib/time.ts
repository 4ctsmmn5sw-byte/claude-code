/** 1 日の分数 */
export const DAY_MINUTES = 24 * 60;

/** タイムラインの縦方向の倍率（1 分あたりの px）。24h = 1728px */
export const PX_PER_MINUTE = 1.2;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 分を "HH:MM" に。1440 は "24:00" */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 所要時間を "1時間30分" のように */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/**
 * "9:05" "09:05" "0905" "905" "9" "24:00" を分に変換する。
 * 不正な値は null。allow24 が true のときだけ "24:00" を受け付ける。
 */
export function parseTime(input: string, { allow24 = false } = {}): number | null {
  const s = input.trim().replace(/[：]/g, ":").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  let h: number;
  let m: number;
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (/^\d{3,4}$/.test(s)) {
    h = Number(s.slice(0, s.length - 2));
    m = Number(s.slice(-2));
  } else if (/^\d{1,2}$/.test(s)) {
    h = Number(s);
    m = 0;
  } else {
    return null;
  }
  if (m < 0 || m > 59 || h < 0) return null;
  const total = h * 60 + m;
  if (total > DAY_MINUTES || (total === DAY_MINUTES && !allow24)) return null;
  if (h > 24) return null;
  return total;
}

/** 刻みに丸める（四捨五入） */
export function snap(min: number, step: number): number {
  return Math.round(min / step) * step;
}

/**
 * タイムライン内の Y 座標（px、タイムライン上端が 0）を分に換算する。
 * 呼び出し側は clientY - timelineRect.top を渡すので、スクロール量や画面サイズに依存しない。
 */
export function yToMinutes(y: number, pxPerMinute = PX_PER_MINUTE): number {
  return y / pxPerMinute;
}

export function minutesToY(min: number, pxPerMinute = PX_PER_MINUTE): number {
  return min * pxPerMinute;
}

/**
 * ドラッグ中のポインタ位置から、タスクの開始時刻（刻み済み・範囲内）を求める。
 * @param pointerClientY ポインタの clientY
 * @param timelineTop    タイムライン本体（0:00 の線）の getBoundingClientRect().top
 * @param grabOffsetPx   掴んだ位置とタスク上端の距離（px）
 * @param duration       タスクの長さ（分）。終了が 24:00 を超えないよう開始を制限する
 */
export function pointerToStartMinutes(
  pointerClientY: number,
  timelineTop: number,
  grabOffsetPx: number,
  duration: number,
  step: number,
  pxPerMinute = PX_PER_MINUTE,
): number {
  const raw = yToMinutes(pointerClientY - timelineTop - grabOffsetPx, pxPerMinute);
  const snapped = snap(raw, step);
  return clamp(snapped, 0, Math.max(0, DAY_MINUTES - duration));
}
