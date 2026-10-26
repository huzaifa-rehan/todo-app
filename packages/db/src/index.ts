import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

export type Db = ReturnType<typeof createDb>;

let db: Db | undefined;

// Created on first use so importing this package never needs DATABASE_URL (builds, tests).
export function getDb() {
  return (db ??= createDb());
}

export * from "./schema";
// Re-exported so every package uses this package's single drizzle-orm copy.
export { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
