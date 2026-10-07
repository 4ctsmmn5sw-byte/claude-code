import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Next.js の dev サーバーは localhost 以外のオリジンからの開発用リクエスト
 * （JS チャンク・HMR）を既定で拒否する。スマホ等から LAN の IP で開くと
 * hydration されずに画面が操作不能になるため、このマシン自身の IP を許可する。
 * それ以外のホスト名は ALLOWED_DEV_ORIGINS（カンマ区切り）で追加できる。
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
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
