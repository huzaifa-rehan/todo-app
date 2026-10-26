import { notFound } from "next/navigation";
import { ItemList } from "./item-list";

export default async function ListPage({
  params,
}: {
  params: Promise<{ workspaceId: string; itemId?: string[] }>;
}) {
  const { workspaceId, itemId } = await params;
  if (itemId && itemId.length > 1) notFound();
  return <ItemList workspaceId={workspaceId} itemId={itemId?.[0]} />;
}
