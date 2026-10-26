import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Locally DATABASE_URL lives in the repo-root .env; in CI/Vercel it is already in the environment.
if (!process.env.DATABASE_URL && existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
