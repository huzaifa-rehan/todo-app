import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real database from the repo-root .env; skipped when there is none (CI).
if (!process.env.DATABASE_URL && existsSync("../../.env")) process.loadEnvFile("../../.env");

const { app } = await import("./index");
const { eq, getDb, inArray, members, user, workspaces } = await import("@ability/db");

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const emails: string[] = [];

async function signUp(name: string) {
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

function api(cookie: string) {
  return async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api/v1${path}`, {
      method,
      headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
}

describe.skipIf(!process.env.DATABASE_URL)("items API", () => {
  let a: ReturnType<typeof api>;
  let b: ReturnType<typeof api>;
  let ws: string;
  let otherWs: string;

  beforeAll(async () => {
    const alice = await signUp("Alice");
    const bob = await signUp("Bob");
    a = api(alice.cookie);
    b = api(bob.cookie);
    ws = alice.workspaceId;
    otherWs = bob.workspaceId;
  });

  afterAll(async () => {
    const db = getDb();
    const users = await db.select({ id: user.id }).from(user).where(inArray(user.email, emails));
    for (const u of users) {
      const owned = await db.select({ id: members.workspaceId }).from(members).where(eq(members.userId, u.id));
      if (owned.length) await db.delete(workspaces).where(inArray(workspaces.id, owned.map((o) => o.id)));
    }
    await db.delete(user).where(inArray(user.email, emails));
  });

  it("creates, nests, lists, updates and deletes items", async () => {
    const project = await a("POST", `/workspaces/${ws}/items`, { title: "Launch", type: "project" });
    expect(project.status).toBe(201);
    const projectId = project.body.item.id;

    const task = await a("POST", `/workspaces/${ws}/items`, { title: "Write copy", parentId: projectId });
    expect(task.body.item).toMatchObject({ parentId: projectId, type: "task", status: "todo", sortOrder: 0 });
    const second = await a("POST", `/workspaces/${ws}/items`, { title: "Pick date", parentId: projectId });
    expect(second.body.item.sortOrder).toBe(1);

    const root = await a("GET", `/workspaces/${ws}/items`);
    expect(root.body.items).toEqual([expect.objectContaining({ id: projectId, childCount: 2, doneCount: 0 })]);

    const done = await a("PATCH", `/workspaces/${ws}/items/${task.body.item.id}`, { status: "done" });
    expect(done.body.item).toMatchObject({ status: "done", title: "Write copy" });

    const children = await a("GET", `/workspaces/${ws}/items?parentId=${projectId}`);
    expect(children.body.items.map((i: { title: string }) => i.title)).toEqual(["Write copy", "Pick date"]);

    const detail = await a("GET", `/workspaces/${ws}/items/${task.body.item.id}`);
    expect(detail.body.breadcrumbs.map((c: { title: string }) => c.title)).toEqual(["Launch", "Write copy"]);
    expect((await a("GET", `/workspaces/${ws}/items/${projectId}`)).body.item).toMatchObject({ doneCount: 1 });

    const cycle = await a("PATCH", `/workspaces/${ws}/items/${projectId}`, { parentId: task.body.item.id });
    expect(cycle.status).toBe(400);

    expect((await a("DELETE", `/workspaces/${ws}/items/${projectId}`)).status).toBe(200);
    expect((await a("GET", `/workspaces/${ws}/items/${task.body.item.id}`)).status).toBe(404);
  });

  it("validates input", async () => {
    expect((await a("POST", `/workspaces/${ws}/items`, { title: "  " })).status).toBe(400);
    expect((await a("GET", `/workspaces/${ws}/items/not-a-uuid`)).status).toBe(404);
    const orphan = await a("POST", `/workspaces/${ws}/items`, { title: "x", parentId: crypto.randomUUID() });
    expect(orphan.status).toBe(400);
  });

  it("keeps workspaces private", async () => {
    const secret = await a("POST", `/workspaces/${ws}/items`, { title: "Secret" });
    expect((await b("GET", `/workspaces/${ws}/items`)).status).toBe(404);
    expect((await b("PATCH", `/workspaces/${ws}/items/${secret.body.item.id}`, { title: "pwned" })).status).toBe(404);
    expect((await b("DELETE", `/workspaces/${ws}/items/${secret.body.item.id}`)).status).toBe(404);
    // Bob can't reach Alice's item through his own workspace either.
    expect((await b("GET", `/workspaces/${otherWs}/items/${secret.body.item.id}`)).status).toBe(404);
    // Or adopt it as a parent.
    expect((await b("POST", `/workspaces/${otherWs}/items`, { title: "x", parentId: secret.body.item.id })).status).toBe(400);
    expect((await app.request(`/api/v1/workspaces/${ws}/items`)).status).toBe(401);
  });
});
