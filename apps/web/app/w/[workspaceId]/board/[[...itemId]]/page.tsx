import { notFound } from "next/navigation";
import { Board } from "./board";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ workspaceId: string; itemId?: string[] }>;
}) {
  const { workspaceId, itemId } = await params;
  if (itemId && itemId.length > 1) notFound();
  return <Board workspaceId={workspaceId} itemId={itemId?.[0]} />;
}
