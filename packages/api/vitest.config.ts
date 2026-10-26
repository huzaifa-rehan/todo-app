import { defineConfig } from "vitest/config";

export default defineConfig({
  // Integration tests make several round trips to the remote database per request.
  test: { testTimeout: 60_000, hookTimeout: 60_000 },
});
