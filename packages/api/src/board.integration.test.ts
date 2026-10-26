import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Api, apiAs, cleanupUsers, hasDatabase, signUp } from "./test-helpers";

describe.skipIf(!hasDatabase)("board API", () => {
  let a: Api;
  let b: Api;
  let ws: string;

  beforeAll(async () => {
    const alice = await signUp("Alice");
    const bob = await signUp("Bob");
    a = apiAs(alice.cookie);
    b = apiAs(bob.cookie);
    ws = alice.workspaceId;
  });

  afterAll(cleanupUsers);

  const create = async (body: object) => (await a("POST", `/workspaces/${ws}/items`, body)).body.item;

  it("loads boards with positions and edges, and saves moves", async () => {
    const project = await create({ title: "Launch", type: "project", position: { x: 10, y: 20 } });
    const unplaced = await create({ title: "Unplaced" });
    const t1 = await create({ title: "Copy", parentId: project.id, position: { x: 0, y: 0 } });
    const t2 = await create({ title: "Design", parentId: project.id, position: { x: 300, y: 0 } });

    const root = await a("GET", `/workspaces/${ws}/board`);
    expect(root.body.owner).toBeNull();
    expect(root.body.breadcrumbs).toEqual([]);
    const byId = Object.fromEntries(root.body.items.map((i: { id: string }) => [i.id, i]));
    expect(byId[project.id]).toMatchObject({ x: 10, y: 20, childCount: 2 });
    expect(byId[unplaced.id]).toMatchObject({ x: null, y: null });

    const edge = await a("POST", `/workspaces/${ws}/board/edges`, { sourceItemId: t1.id, targetItemId: t2.id });
    expect(edge.status).toBe(201);
    // Connecting the same pair again returns the existing edge.
    const again = await a("POST", `/workspaces/${ws}/board/edges`, { sourceItemId: t1.id, targetItemId: t2.id });
    expect(again.body.edge.id).toBe(edge.body.edge.id);

    const saved = await a("PUT", `/workspaces/${ws}/board/positions`, {
      positions: [
        { itemId: t1.id, x: 50, y: 60 },
        { itemId: unplaced.id, x: -5, y: 7.5 },
      ],
    });
    expect(saved.status).toBe(200);

    const inner = await a("GET", `/workspaces/${ws}/board?ownerId=${project.id}`);
    expect(inner.body.owner).toMatchObject({ id: project.id, title: "Launch" });
    expect(inner.body.breadcrumbs.map((c: { title: string }) => c.title)).toEqual(["Launch"]);
    expect(inner.body.items.find((i: { id: string }) => i.id === t1.id)).toMatchObject({ x: 50, y: 60 });
    expect(inner.body.edges).toEqual([expect.objectContaining({ sourceItemId: t1.id, targetItemId: t2.id })]);
    expect((await a("GET", `/workspaces/${ws}/board`)).body.items.find((i: { id: string }) => i.id === unplaced.id))
      .toMatchObject({ x: -5, y: 7.5 });

    const reverse = await a("POST", `/workspaces/${ws}/board/edges`, { sourceItemId: t2.id, targetItemId: t1.id });
    expect((await a("DELETE", `/workspaces/${ws}/board/edges/${reverse.body.edge.id}`)).status).toBe(200);
    expect((await b("DELETE", `/workspaces/${ws}/board/edges/${edge.body.edge.id}`)).status).toBe(404);

    // Moving an item to another board drops its old position and connections.
    await a("PATCH", `/workspaces/${ws}/items/${t1.id}`, { parentId: null });
    const afterMove = await a("GET", `/workspaces/${ws}/board?ownerId=${project.id}`);
    expect(afterMove.body.edges).toEqual([]);
    const moved = (await a("GET", `/workspaces/${ws}/board`)).body.items.find((i: { id: string }) => i.id === t1.id);
    expect(moved).toMatchObject({ x: null, y: null });

    expect((await a("DELETE", `/workspaces/${ws}/board/edges/${edge.body.edge.id}`)).status).toBe(404);
  });

  it("rejects invalid connections", async () => {
    const p = await create({ title: "P", type: "project" });
    const inside = await create({ title: "Inside", parentId: p.id });
    const outside = await create({ title: "Outside" });
    const edge = (body: object) => a("POST", `/workspaces/${ws}/board/edges`, body);
    expect((await edge({ sourceItemId: p.id, targetItemId: p.id })).status).toBe(400);
    expect((await edge({ sourceItemId: inside.id, targetItemId: outside.id })).status).toBe(400);
    expect((await edge({ sourceItemId: p.id, targetItemId: crypto.randomUUID() })).status).toBe(400);
    expect((await a("GET", `/workspaces/${ws}/board?ownerId=${crypto.randomUUID()}`)).status).toBe(404);
  });

  it("keeps boards private", async () => {
    const item = await create({ title: "Mine" });
    expect((await b("GET", `/workspaces/${ws}/board`)).status).toBe(404);
    expect((await b("PUT", `/workspaces/${ws}/board/positions`, { positions: [{ itemId: item.id, x: 0, y: 0 }] })).status).toBe(404);
    // Bob can't place Alice's item through his own workspace either.
    const bobWs = (await b("GET", "/me")).body.workspaces[0].id;
    const sneaky = await b("PUT", `/workspaces/${bobWs}/board/positions`, { positions: [{ itemId: item.id, x: 0, y: 0 }] });
    expect(sneaky.status).toBe(400);
  });
});
