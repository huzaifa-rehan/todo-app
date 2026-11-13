import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Local secrets live in the repo-root .env; on Vercel they come from project settings.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const nextConfig: NextConfig = {
  // The always-on desktop board builds to its own folder, so `next dev` can't overwrite it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Workspace packages ship TypeScript source, so Next compiles them.
  transpilePackages: ["@ability/api", "@ability/db", "@ability/shared"],
};

export default nextConfig;
