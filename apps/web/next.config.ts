import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Local secrets live in the repo-root .env; on Vercel they come from project settings.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them.
  transpilePackages: ["@ability/api", "@ability/db", "@ability/shared"],
};

export default nextConfig;
