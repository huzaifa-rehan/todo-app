import { and, eq, getDb, members, workspaces } from "@ability/db";

export async function getUserWorkspaces(userId: string) {
  return getDb()
    .select({ id: workspaces.id, name: workspaces.name })
    .from(members)
    .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
    .where(eq(members.userId, userId))
    .orderBy(workspaces.createdAt);
}

export async function getWorkspaceForUser(workspaceId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return undefined;
  const [workspace] = await getDb()
    .select({ id: workspaces.id, name: workspaces.name })
    .from(members)
    .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
    .where(and(eq(members.workspaceId, workspaceId), eq(members.userId, userId)));
  return workspace;
}
