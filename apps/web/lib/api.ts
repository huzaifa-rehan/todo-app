import { createApiClient } from "@ability/api/client";
import type { QueryClient } from "@tanstack/react-query";
import type { ClientResponse, InferResponseType } from "hono/client";

// Browser-only: requests go to the same origin and carry the session cookie.
export const api = createApiClient("/").api.v1;

type ListItems = (typeof api.workspaces)[":workspaceId"]["items"]["$get"];
export type Item = InferResponseType<ListItems, 200>["items"][number];

type GetBoard = (typeof api.workspaces)[":workspaceId"]["board"]["$get"];
export type Board = InferResponseType<GetBoard, 200>;
export type BoardItem = Board["items"][number];

// List and board views share the same items, so a change in either refreshes both.
export function invalidateWorkspace(queryClient: QueryClient, workspaceId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["items", workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ["item", workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ["board", workspaceId] }),
  ]);
}

// Every error body has an `error` key, so removing those leaves the success body.
type SuccessBody<R> = Exclude<R extends ClientResponse<infer T, number, "json"> ? T : never, { error: unknown }>;

export async function unwrap<R extends ClientResponse<unknown, number, "json">>(res: Promise<R>) {
  const r = await res;
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const error = (body as { error?: unknown }).error;
    throw new Error(typeof error === "string" ? error : `Request failed (${r.status})`);
  }
  return body as SuccessBody<R>;
}
