import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Api, apiAs, app, cleanupUsers, hasDatabase, signUp } from "./test-helpers";

describe.skipIf(!hasDatabase)("items API", () => {
  let a: Api;
  let b: Api;
  let ws: string;
  let otherWs: string;

  beforeAll(async () => {
    const alice = await signUp("Alice");
    const bob = await signUp("Bob");
    a = apiAs(alice.cookie);
    b = apiAs(bob.cookie);
    ws = alice.workspaceId;
    otherWs = bob.workspaceId;
  });

  afterAll(cleanupUsers);

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
