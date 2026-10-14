import type { AiStatus, PlanApiResponse, PlanRequest } from "./planSchema";

/** ブラウザから AI 機能のサーバー API を呼ぶ（API キーはサーバー側にだけある） */

export async function fetchAiStatus(): Promise<AiStatus | null> {
  try {
    const res = await fetch("/api/ai/session", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as AiStatus;
  } catch {
    return null;
  }
}

export async function loginAi(passcode: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch("/api/ai/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    return (await res.json()) as { ok: boolean; message?: string };
  } catch {
    return { ok: false, message: "通信に失敗しました" };
  }
}

export async function logoutAi(): Promise<void> {
  await fetch("/api/ai/session", { method: "DELETE" }).catch(() => undefined);
}

export async function requestPlan(req: PlanRequest): Promise<PlanApiResponse> {
  try {
    const res = await fetch("/api/ai/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const body = (await res.json().catch(() => null)) as PlanApiResponse | null;
    if (body && typeof body === "object" && "ok" in body) return body;
    return { ok: false, code: "upstream_error", message: `サーバーでエラーが発生しました（${res.status}）` };
  } catch {
    return { ok: false, code: "upstream_error", message: "通信に失敗しました。電波の良い場所で試してください" };
  }
}

export async function checkAiModel(): Promise<{ ok: boolean; model?: string; displayName?: string; message?: string }> {
  try {
    const res = await fetch("/api/ai/session?check=model", { cache: "no-store" });
    return await res.json();
  } catch {
    return { ok: false, message: "通信に失敗しました" };
  }
}
