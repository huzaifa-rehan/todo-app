import { and, asc, boardNodes, edges, eq, getDb, inArray, isNull, items, sql } from "@ability/db";
import { boardQuerySchema, createEdgeSchema, savePositionsSchema } from "@ability/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { ancestors, findItem, itemColumns } from "./items";
import { requireMember, requireUser, type WorkspaceEnv } from "./middleware";

const edgeColumns = {
  id: edges.id,
  sourceItemId: edges.sourceItemId,
  targetItemId: edges.targetItemId,
  kind: edges.kind,
  label: edges.label,
};

const edgeParam = zValidator(
  "param",
  z.object({ workspaceId: z.string(), edgeId: z.string().uuid() }),
  (result, c) => {
    if (!result.success) return c.json({ error: "Not found" }, 404);
  },
);

// A board is the set of children of one item (ownerId), or the top-level items when ownerId is absent.
export const boardRoutes = new Hono<WorkspaceEnv>()
  .use("/workspaces/:workspaceId/*", requireUser, requireMember)
  .get("/workspaces/:workspaceId/board", zValidator("query", boardQuerySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { ownerId } = c.req.valid("query");
    const owner = ownerId ? await findItem(workspaceId, ownerId) : null;
    if (ownerId && !owner) return c.json({ error: "Not found" }, 404);

    const db = getDb();
    const onBoard = ownerId ? eq(items.parentId, ownerId) : isNull(items.parentId);
    const [nodes, boardEdges, breadcrumbs] = await Promise.all([
      db
        .select({ ...itemColumns, x: boardNodes.x, y: boardNodes.y })
        .from(items)
        .leftJoin(boardNodes, eq(boardNodes.itemId, items.id))
        .where(and(eq(items.workspaceId, workspaceId), onBoard))
        .orderBy(asc(items.sortOrder), asc(items.createdAt)),
      db
        .select(edgeColumns)
        .from(edges)
        .where(
          and(eq(edges.workspaceId, workspaceId), ownerId ? eq(edges.boardOwnerId, ownerId) : isNull(edges.boardOwnerId)),
        ),
      ownerId ? ancestors(workspaceId, ownerId) : Promise.resolve([]),
    ]);
    return c.json({ owner, breadcrumbs, items: nodes, edges: boardEdges });
  })
  .put("/workspaces/:workspaceId/board/positions", zValidator("json", savePositionsSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { positions } = c.req.valid("json");
    const db = getDb();
    // Only items in this workspace; each lands on its parent's board.
    const owned = await db
      .select({ id: items.id, parentId: items.parentId })
      .from(items)
      .where(and(eq(items.workspaceId, workspaceId), inArray(items.id, positions.map((p) => p.itemId))));
    const parentOf = new Map(owned.map((o) => [o.id, o.parentId]));
    const rows = positions
      .filter((p) => parentOf.has(p.itemId))
      .map((p) => ({ ...p, workspaceId, boardOwnerId: parentOf.get(p.itemId)! }));
    if (rows.length !== positions.length) return c.json({ error: "Item not found" }, 400);
    await db
      .insert(boardNodes)
      .values(rows)
      .onConflictDoUpdate({
        target: boardNodes.itemId,
        set: { x: sql`excluded.x`, y: sql`excluded.y`, boardOwnerId: sql`excluded.board_owner_id`, updatedAt: new Date() },
      });
    return c.json({ ok: true });
  })
  .post("/workspaces/:workspaceId/board/edges", zValidator("json", createEdgeSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const input = c.req.valid("json");
    if (input.sourceItemId === input.targetItemId) return c.json({ error: "Cannot connect an item to itself" }, 400);
    const [source, target] = await Promise.all([
      findItem(workspaceId, input.sourceItemId),
      findItem(workspaceId, input.targetItemId),
    ]);
    if (!source || !target) return c.json({ error: "Item not found" }, 400);
    if (source.parentId !== target.parentId) return c.json({ error: "Items are on different boards" }, 400);

    const db = getDb();
    const [existing] = await db
      .select(edgeColumns)
      .from(edges)
      .where(and(eq(edges.sourceItemId, source.id), eq(edges.targetItemId, target.id)));
    if (existing) return c.json({ edge: existing });
    const [edge] = await db
      .insert(edges)
      .values({ ...input, workspaceId, boardOwnerId: source.parentId })
      .returning(edgeColumns);
    return c.json({ edge: edge! }, 201);
  })
  .delete("/workspaces/:workspaceId/board/edges/:edgeId", edgeParam, async (c) => {
    const [deleted] = await getDb()
      .delete(edges)
      .where(and(eq(edges.workspaceId, c.get("workspaceId")), eq(edges.id, c.req.valid("param").edgeId)))
      .returning({ id: edges.id });
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });
