import { Hono } from "hono";

// Routes are chained so AppType carries every route for the typed client.
export const app = new Hono()
  .basePath("/api/v1")
  .get("/health", (c) => c.json({ ok: true }));

export type AppType = typeof app;
