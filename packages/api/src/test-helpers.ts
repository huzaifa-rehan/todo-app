import { existsSync } from "node:fs";
import { expect } from "vitest";

// Integration tests run against the real database from the repo-root .env; skipped when there is none (CI).
if (!process.env.DATABASE_URL && existsSync("../../.env")) process.loadEnvFile("../../.env");
export const hasDatabase = !!process.env.DATABASE_URL;

const { app } = await import("./index");
const { eq, getDb, inArray, members, user, workspaces } = await import("@ability/db");

export { app };

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const emails: string[] = [];

export async function signUp(name: string) {
  const email = `test-${crypto.randomUUID()}@example.com`;
  emails.push(email);
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ name, email, password: "correct-horse-battery" }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const me = await (await app.request("/api/v1/me", { headers: { cookie } })).json();
  return { cookie, workspaceId: me.workspaces[0].id as string };
}

export type Api = ReturnType<typeof apiAs>;

export function apiAs(cookie: string) {
  return async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api/v1${path}`, {
      method,
      headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
}

// Deletes every user created by signUp in this file, along with their workspaces.
export async function cleanupUsers() {
  const db = getDb();
  const users = await db.select({ id: user.id }).from(user).where(inArray(user.email, emails));
  for (const u of users) {
    const owned = await db.select({ id: members.workspaceId }).from(members).where(eq(members.userId, u.id));
    if (owned.length) await db.delete(workspaces).where(inArray(workspaces.id, owned.map((o) => o.id)));
  }
  if (emails.length) await db.delete(user).where(inArray(user.email, emails));
}
