import { readConfig } from "@/lib/server/config";
import { handlePlan } from "@/lib/server/handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 目標を作業工程に分解する（Gemini API／API キー未設定なら仮データ） */
export async function POST(req: Request) {
  return handlePlan(req, { cfg: readConfig() });
}
