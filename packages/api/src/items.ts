import { and, asc, boardNodes, edges, eq, getDb, isNull, items, or, sql } from "@ability/db";
import { createItemSchema, listItemsQuerySchema, updateItemSchema } from "@ability/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { requireMember, requireUser, type WorkspaceEnv } from "./middleware";

// A malformed id can't match any row, so answer 404 instead of letting Postgres reject the uuid.
const itemParam = zValidator(
  "param",
  z.object({ workspaceId: z.string(), itemId: z.string().uuid() }),
  (result, c) => {
    if (!result.success) return c.json({ error: "Not found" }, 404);
  },
);

// Drizzle renders ${items.id} unqualified inside select(), which would bind to the subquery row,
// so the outer row is referenced by its table name explicitly.
const childCounts = {
  childCount: sql<number>`(select count(*)::int from ${items} c where c.parent_id = "items"."id")`,
  doneCount: sql<number>`(select count(*)::int from ${items} c where c.parent_id = "items"."id" and c.status = 'done')`,
};

export const itemColumns = {
  id: items.id,
  parentId: items.parentId,
  type: items.type,
  title: items.title,
  description: items.description,
  status: items.status,
  priority: items.priority,
  dueAt: items.dueAt,
  sortOrder: items.sortOrder,
  createdAt: items.createdAt,
  updatedAt: items.updatedAt,
  ...childCounts,
};

export async function findItem(workspaceId: string, id: string) {
  const [item] = await getDb()
    .select(itemColumns)
    .from(items)
    .where(and(eq(items.workspaceId, workspaceId), eq(items.id, id)));
  return item;
}

// Root first, ending with the item itself.
export async function ancestors(workspaceId: string, id: string) {
  const { rows } = await getDb().execute<{ id: string; title: string; type: string }>(sql`
    with recursive chain as (
      select id, parent_id, title, type, 0 as depth from ${items}
      where id = ${id} and workspace_id = ${workspaceId}
      union all
      select i.id, i.parent_id, i.title, i.type, chain.depth + 1 from ${items} i
      join chain on i.id = chain.parent_id
    )
    select id, title, type from chain order by depth desc`);
  return rows;
}

export const itemRoutes = new Hono<WorkspaceEnv>()
  .use("/workspaces/:workspaceId/*", requireUser, requireMember)
  .get("/workspaces/:workspaceId/items", zValidator("query", listItemsQuerySchema), async (c) => {
    const { parentId } = c.req.valid("query");
    const rows = await getDb()
      .select(itemColumns)
      .from(items)
      .where(
        and(
          eq(items.workspaceId, c.get("workspaceId")),
          parentId ? eq(items.parentId, parentId) : isNull(items.parentId),
        ),
      )
      .orderBy(asc(items.sortOrder), asc(items.createdAt));
    return c.json({ items: rows });
  })
  .get("/workspaces/:workspaceId/items/:itemId", itemParam, async (c) => {
    const workspaceId = c.get("workspaceId");
    const item = await findItem(workspaceId, c.req.valid("param").itemId);
    if (!item) return c.json({ error: "Not found" }, 404);
    return c.json({ item, breadcrumbs: await ancestors(workspaceId, item.id) });
  })
  .post("/workspaces/:workspaceId/items", zValidator("json", createItemSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { position, ...input } = c.req.valid("json");
    if (input.parentId && !(await findItem(workspaceId, input.parentId))) {
      return c.json({ error: "Parent not found" }, 400);
    }
    const db = getDb();
    const siblings = input.parentId ? eq(items.parentId, input.parentId) : isNull(items.parentId);
    const [{ next } = { next: 0 }] = await db
      .select({ next: sql<number>`coalesce(max(${items.sortOrder}), -1) + 1` })
      .from(items)
      .where(and(eq(items.workspaceId, workspaceId), siblings));
    const [created] = await db
      .insert(items)
      .values({ ...input, workspaceId, sortOrder: next, createdBy: c.get("user").id })
      .returning({ id: items.id });
    if (position) {
      await db.insert(boardNodes).values({ itemId: created!.id, workspaceId, boardOwnerId: input.parentId, ...position });
    }
    return c.json({ item: (await findItem(workspaceId, created!.id))! }, 201);
  })
  .patch("/workspaces/:workspaceId/items/:itemId", itemParam, zValidator("json", updateItemSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.valid("param").itemId;
    const input = c.req.valid("json");
    const existing = await findItem(workspaceId, id);
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (input.parentId) {
      // An item can't move inside itself or any of its descendants.
      const chain = await ancestors(workspaceId, input.parentId);
      if (chain.length === 0) return c.json({ error: "Parent not found" }, 400);
      if (chain.some((a) => a.id === id)) return c.json({ error: "Cannot move an item inside itself" }, 400);
    }
    const db = getDb();
    await db
      .update(items)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(items.workspaceId, workspaceId), eq(items.id, id)));
    if (input.parentId !== undefined && input.parentId !== existing.parentId) {
      // Moved to another board: its old position and connections no longer apply.
      await db.delete(boardNodes).where(eq(boardNodes.itemId, id));
      await db.delete(edges).where(or(eq(edges.sourceItemId, id), eq(edges.targetItemId, id)));
    }
    return c.json({ item: (await findItem(workspaceId, id))! });
  })
  .delete("/workspaces/:workspaceId/items/:itemId", itemParam, async (c) => {
    const [deleted] = await getDb()
      .delete(items)
      .where(and(eq(items.workspaceId, c.get("workspaceId")), eq(items.id, c.req.valid("param").itemId)))
      .returning({ id: items.id });
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });
