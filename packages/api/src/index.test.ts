import { describe, expect, it } from "vitest";
import { app } from "./index";

describe("api", () => {
  it("answers the health check", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
