import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * 実機のスマートフォンから LAN の IP で dev サーバーを開けるよう、このマシン自身の IP を開発用オリジンとして許可する
 * （既定では localhost 以外からの JS チャンク・HMR が拒否され、画面が操作できない）。
 * それ以外のホスト名は ALLOWED_DEV_ORIGINS（カンマ区切り）で追加できる。本番ビルドには影響しない。
 */
function devOrigins(): string[] {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && !net.internal)
    .map((net) => net!.address);
  const extra = (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...ips, ...extra])];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins(),
};

export default nextConfig;
