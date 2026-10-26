import Link from "next/link";

// Toggles between the list and board views of the same item.
export function ViewSwitch({
  workspaceId,
  itemId,
  current,
}: {
  workspaceId: string;
  itemId?: string;
  current: "list" | "board";
}) {
  const suffix = itemId ? `/${itemId}` : "";
  const tab = (view: "list" | "board", label: string) => (
    <Link
      href={`/w/${workspaceId}/${view}${suffix}`}
      aria-current={current === view ? "page" : undefined}
      className={`rounded-md px-3 py-1 text-sm ${
        current === view ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-900"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex rounded-lg bg-neutral-100 p-0.5">
      {tab("board", "Board")}
      {tab("list", "List")}
    </div>
  );
}
