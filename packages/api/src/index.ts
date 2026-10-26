import { eq, getDb, members, workspaces } from "@ability/db";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";

type Session = NonNullable<Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>>;
type AuthEnv = { Variables: { user: Session["user"]; session: Session["session"] } };

const requireUser = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});

// Routes are chained so AppType carries every route for the typed client.
const v1 = new Hono()
  .get("/health", (c) => c.json({ ok: true }))
  .get("/me", requireUser, async (c) => {
    const user = c.get("user");
    const userWorkspaces = await getDb()
      .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, role: members.role })
      .from(members)
      .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
      .where(eq(members.userId, user.id));
    return c.json({ user: { id: user.id, name: user.name, email: user.email }, workspaces: userWorkspaces });
  });

export const app = new Hono()
  .basePath("/api")
  .on(["GET", "POST"], "/auth/*", (c) => getAuth().handler(c.req.raw))
  .route("/v1", v1);

export type AppType = typeof app;
export { getAuth } from "./auth";
