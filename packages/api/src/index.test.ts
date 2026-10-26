import { beforeAll, describe, expect, it } from "vitest";
import { app } from "./index";

beforeAll(() => {
  // Never contacted: requests without a session cookie are rejected before any query runs.
  process.env.DATABASE_URL ??= "postgres://user:pass@localhost/db";
});

describe("api", () => {
  it("answers the health check", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects /me without a session", async () => {
    const res = await app.request("/api/v1/me");
    expect(res.status).toBe(401);
  });
});
