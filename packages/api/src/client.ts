import { hc } from "hono/client";
import type { AppType } from "./index";

export function createApiClient(baseUrl: string, init?: { headers?: Record<string, string> }) {
  return hc<AppType>(baseUrl, init);
}
