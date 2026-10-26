import { and, eq, getDb, members } from "@ability/db";
import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";

type Session = NonNullable<Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>>;

export type AuthEnv = { Variables: { user: Session["user"]; session: Session["session"] } };
export type WorkspaceEnv = { Variables: AuthEnv["Variables"] & { workspaceId: string } };

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const requireUser = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});

// Runs after requireUser. 404 rather than 403 so workspace ids don't leak.
export const requireMember = createMiddleware<WorkspaceEnv>(async (c, next) => {
  const workspaceId = c.req.param("workspaceId");
  if (!workspaceId || !uuidRe.test(workspaceId)) return c.json({ error: "Not found" }, 404);
  const [member] = await getDb()
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.workspaceId, workspaceId), eq(members.userId, c.get("user").id)));
  if (!member) return c.json({ error: "Not found" }, 404);
  c.set("workspaceId", workspaceId);
  await next();
});
