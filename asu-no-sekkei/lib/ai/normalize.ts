import { LIMITS } from "./planSchema";

/**
 * AI の出力を、厳密な検証（aiResponseSchema）の前に正規化する。
 *
 * 方針：
 * - 識別子（質問の id・工程の key）は AI の値を使わず、アプリ側で並び順から短く一意な値（q1… / s1…）を振り直す。
 *   AI の id が長くても・重複していても切り詰めないので、切り詰めによる重複は起きない。
 *   工程の前提（dependsOn）は「AI の key → 新しい key」の対応表で付け替える。
 * - 意味を変えずに直せるもの（前後の空白、数字の文字列、大文字小文字、表示用の文章の長さ超過、
 *   上限を超えた質問・選択肢の数など）は直し、何を直したかを repairs に記録する。
 * - 意味が変わる・推測が必要なもの（工程名が空、推定時間が範囲外、工程数の超過、
 *   前提が重複した key を指していて対応が決まらない等）は直さず、issues に理由を記録して失敗にする。
 * 正規化の後で、必ず厳密な検証を通す（検証は緩めない）。
 */

export type NormalizeResult = { ok: true; data: unknown; repairs: string[] } | { ok: false; issues: string[]; repairs: string[] };

const PRIORITY_MAP: Record<string, "high" | "medium" | "low"> = {
  high: "high",
  medium: "medium",
  med: "medium",
  middle: "medium",
  low: "low",
  高: "high",
  中: "medium",
  低: "low",
};
const FEASIBILITY_VALUES = ["ok", "tight", "unlikely", "unknown"];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function normalizeAiResponse(raw: unknown): NormalizeResult {
  const repairs: string[] = [];
  const issues: string[] = [];
  if (!isObject(raw)) return { ok: false, issues: ["応答が JSON オブジェクトではありません"], repairs };

  /** 表示用の文章：文字列にして前後の空白を除き、長すぎれば末尾を「…」にする */
  const text = (v: unknown, max: number, path: string): string => {
    if (v === undefined || v === null) return "";
    if (typeof v !== "string") {
      repairs.push(`${path}: 文字列以外を空にしました`);
      return "";
    }
    const t = v.trim();
    if (t.length <= max) return t;
    repairs.push(`${path}: ${max}文字に短縮しました`);
    return `${t.slice(0, max - 1)}…`;
  };

  /* ---------- questions ---------- */
  let rawQuestions: unknown[] = [];
  if (Array.isArray(raw.questions)) rawQuestions = raw.questions;
  else if (raw.questions !== undefined && raw.questions !== null) repairs.push("questions: 配列ではないため無視しました");

  const questions: { id: string; question: string; why: string; options: string[] }[] = [];
  rawQuestions.forEach((q, i) => {
    if (!isObject(q)) {
      repairs.push(`questions.${i}: 形式が正しくないため除外しました`);
      return;
    }
    const question = typeof q.question === "string" ? q.question.trim() : "";
    if (!question) {
      repairs.push(`questions.${i}: 質問文がないため除外しました`);
      return;
    }
    if (question.length > LIMITS.question) {
      // 質問文を途中で切ると意味が変わり、回答との対応も不確かになるため除外する
      repairs.push(`questions.${i}: 質問文が長すぎるため除外しました`);
      return;
    }
    const seen = new Set<string>();
    const options: string[] = [];
    if (Array.isArray(q.options)) {
      for (const o of q.options) {
        if (typeof o !== "string") continue;
        const t = o.trim();
        if (!t || t.length > 60 || seen.has(t)) continue;
        seen.add(t);
        options.push(t);
      }
      if (options.length !== q.options.length) repairs.push(`questions.${i}.options: 使えない選択肢を除外しました`);
    }
    if (options.length > LIMITS.options) repairs.push(`questions.${i}.options: ${LIMITS.options}個までにしました`);
    // AI の id は使わない（長さ・重複に関係なく、並び順から振り直す）
    if (typeof q.id !== "string" || !/^q\d{1,2}$/.test(q.id)) repairs.push(`questions.${i}.id: アプリ側の識別子に置き換えました`);
    questions.push({ id: "", question, why: text(q.why, LIMITS.question, `questions.${i}.why`), options: options.slice(0, LIMITS.options) });
  });
  if (questions.length > LIMITS.questions) repairs.push(`questions: ${LIMITS.questions}問までにしました`);
  const keptQuestions = questions.slice(0, LIMITS.questions).map((q, i) => ({ ...q, id: `q${i + 1}` }));

  /* ---------- plan ---------- */
  const rawPlan = isObject(raw.plan) ? raw.plan : {};
  if (raw.plan !== undefined && !isObject(raw.plan)) repairs.push("plan: オブジェクトではないため無視しました");
  const rawSteps: unknown[] = Array.isArray(rawPlan.steps) ? rawPlan.steps : [];
  if (rawSteps.length > LIMITS.steps) issues.push(`plan.steps: 工程が多すぎます（${rawSteps.length}個、上限${LIMITS.steps}個）`);

  // AI の key → 新しい key。重複した key は前提の付け替え先が決まらない
  const keyMap = new Map<string, string>();
  const duplicated = new Set<string>();
  rawSteps.forEach((s, i) => {
    const k = isObject(s) && (typeof s.key === "string" || typeof s.key === "number") ? String(s.key).trim() : "";
    if (!k) return;
    if (keyMap.has(k)) duplicated.add(k);
    else keyMap.set(k, `s${i + 1}`);
  });

  const steps = rawSteps.slice(0, LIMITS.steps).map((s, i) => {
    const path = `plan.steps.${i}`;
    if (!isObject(s)) {
      issues.push(`${path}: 形式が正しくありません`);
      return null;
    }
    const title = typeof s.title === "string" ? s.title.trim() : "";
    if (!title) issues.push(`${path}.title: 工程名がありません`);
    else if (title.length > LIMITS.stepTitle) issues.push(`${path}.title: 工程名が長すぎます（${title.length}文字）`);

    let minutes: unknown = s.estimatedMinutes;
    if (typeof minutes === "string" && /^\s*\d+(\.\d+)?\s*$/.test(minutes)) {
      minutes = Number(minutes);
      repairs.push(`${path}.estimatedMinutes: 数字の文字列を数値にしました`);
    }
    if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
      issues.push(`${path}.estimatedMinutes: 推定時間がありません`);
      minutes = NaN;
    } else if (!Number.isInteger(minutes)) {
      minutes = Math.round(minutes);
      repairs.push(`${path}.estimatedMinutes: 整数に丸めました`);
    }
    // 範囲外の推定時間は勝手に丸めない（厳密な検証で拒否する）

    const p = typeof s.priority === "string" ? PRIORITY_MAP[s.priority.trim().toLowerCase()] : undefined;
    if (!p) issues.push(`${path}.priority: 優先度が正しくありません`);
    else if (p !== s.priority) repairs.push(`${path}.priority: 表記を揃えました`);

    const deps: string[] = [];
    if (Array.isArray(s.dependsOn)) {
      for (const d of s.dependsOn) {
        if (typeof d !== "string" && typeof d !== "number") continue;
        const k = String(d).trim();
        if (duplicated.has(k)) {
          issues.push(`${path}.dependsOn: 重複した工程の key「${k.slice(0, 20)}」を指しているため、前提の対応が決まりません`);
          continue;
        }
        const mapped = keyMap.get(k);
        if (mapped && mapped !== `s${i + 1}`) deps.push(mapped);
        else repairs.push(`${path}.dependsOn: 存在しない工程への前提を除外しました`);
      }
    } else if (s.dependsOn !== undefined && s.dependsOn !== null) {
      repairs.push(`${path}.dependsOn: 配列ではないため無視しました`);
    }

    return {
      key: `s${i + 1}`,
      title,
      detail: text(s.detail, LIMITS.stepDetail, `${path}.detail`),
      estimatedMinutes: minutes as number,
      priority: p ?? "medium",
      dependsOn: [...new Set(deps)],
    };
  });
  if (duplicated.size > 0 && issues.length === 0) repairs.push("plan.steps: 重複した key を振り直しました");

  const rawFeas = isObject(rawPlan.feasibility) ? rawPlan.feasibility : {};
  let status = typeof rawFeas.status === "string" ? rawFeas.status.trim().toLowerCase() : "";
  if (!FEASIBILITY_VALUES.includes(status)) {
    // 判断できない見立ては「判断できない」として扱う（楽観的な値にはしない）
    repairs.push("plan.feasibility.status: 不明な値のため unknown にしました");
    status = "unknown";
  }

  /* ---------- ready ---------- */
  let ready: unknown = raw.ready;
  if (ready === "true" || ready === "false") {
    ready = ready === "true";
    repairs.push("ready: 文字列を真偽値にしました");
  }
  if (typeof ready !== "boolean") {
    if (steps.length > 0 && keptQuestions.length === 0) ready = true;
    else if (steps.length === 0 && keptQuestions.length > 0) ready = false;
    else {
      issues.push("ready: 計画か質問かを判断できません");
      ready = false;
    }
    if (typeof ready === "boolean" && issues.length === 0) repairs.push("ready: 内容から補いました");
  }

  if (issues.length > 0 || steps.some((s) => s === null)) return { ok: false, issues, repairs };
  return {
    ok: true,
    repairs,
    data: {
      ready,
      // 計画を返すときは質問を使わない
      questions: ready ? [] : keptQuestions,
      plan: {
        summary: text(rawPlan.summary, LIMITS.summary, "plan.summary"),
        approach: text(rawPlan.approach, LIMITS.summary, "plan.approach"),
        feasibility: { status, reason: text(rawFeas.reason, LIMITS.reason, "plan.feasibility.reason") },
        steps,
      },
    },
  };
}

/**
 * モデルの応答テキストから JSON を取り出す。
 * コードブロック（```json … ```）や前後の説明文に囲まれていても、最初の { から対応する } までを読む。
 */
export function extractJson(text: string): { ok: true; value: unknown; repaired: boolean } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "応答が空です" };
  try {
    return { ok: true, value: JSON.parse(trimmed), repaired: false };
  } catch {
    /* 下で取り出しを試みる */
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0) return { ok: false, reason: "JSON が含まれていません" };
  if (end <= start) return { ok: false, reason: "JSON が途中で切れている可能性があります" };
  try {
    return { ok: true, value: JSON.parse(trimmed.slice(start, end + 1)), repaired: true };
  } catch {
    return { ok: false, reason: "JSON の形式が壊れています（途中で切れている可能性があります）" };
  }
}
