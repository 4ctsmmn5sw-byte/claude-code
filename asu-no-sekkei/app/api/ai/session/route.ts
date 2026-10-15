import { readConfig } from "@/lib/server/config";
import { handleLogin, handleLogout, handleModelCheck, handleStatus } from "@/lib/server/handlers";

export const runtime = "nodejs";

/** AI 機能の状態（仮データか、本人確認が必要か、今日の残り回数） */
export async function GET(req: Request) {
  const cfg = readConfig();
  // ?check=model で、設定したモデルが使えるかを確認（生成はしない）
  if (new URL(req.url).searchParams.get("check") === "model") return handleModelCheck(req, { cfg });
  return handleStatus(req, { cfg });
}

/** パスコードで本人確認する */
export async function POST(req: Request) {
  return handleLogin(req, { cfg: readConfig() });
}

/** 本人確認を解除する */
export async function DELETE() {
  return handleLogout({ cfg: readConfig() });
}
