"use client";

import { itemTypes } from "@ability/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api, type Item, unwrap } from "@/lib/api";

type ItemType = (typeof itemTypes)[number];

export function ItemList({ workspaceId, itemId }: { workspaceId: string; itemId?: string }) {
  const queryClient = useQueryClient();
  const listKey = ["items", workspaceId, itemId ?? "root"];
  const base = `/w/${workspaceId}/list`;

  const parent = useQuery({
    queryKey: ["item", workspaceId, itemId],
    enabled: !!itemId,
    queryFn: () =>
      unwrap(api.workspaces[":workspaceId"].items[":itemId"].$get({ param: { workspaceId, itemId: itemId! } })),
  });

  const list = useQuery({
    queryKey: listKey,
    queryFn: () =>
      unwrap(api.workspaces[":workspaceId"].items.$get({ param: { workspaceId }, query: { parentId: itemId } })),
  });

  // Optimistically patch the visible list, roll back on error, then refetch the truth.
  function useListMutation<V>(fn: (v: V) => Promise<unknown>, apply: (items: Item[], v: V) => Item[]) {
    return useMutation({
      mutationFn: fn,
      onMutate: async (v: V) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData<{ items: Item[] }>(listKey);
        if (previous) queryClient.setQueryData(listKey, { items: apply(previous.items, v) });
        return { previous };
      },
      onError: (_e, _v, ctx) => ctx?.previous && queryClient.setQueryData(listKey, ctx.previous),
      onSettled: () => queryClient.invalidateQueries({ queryKey: ["items", workspaceId] }),
    });
  }

  const create = useMutation({
    mutationFn: (v: { title: string; type: ItemType }) =>
      unwrap(
        api.workspaces[":workspaceId"].items.$post({
          param: { workspaceId },
          json: { ...v, parentId: itemId ?? null },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["items", workspaceId] }),
  });

  const update = useListMutation(
    (v: { id: string; patch: { title?: string; status?: Item["status"] } }) =>
      unwrap(
        api.workspaces[":workspaceId"].items[":itemId"].$patch({
          param: { workspaceId, itemId: v.id },
          json: v.patch,
        }),
      ),
    (items, v) => items.map((i) => (i.id === v.id ? { ...i, ...v.patch } : i)),
  );

  const remove = useListMutation(
    (id: string) =>
      unwrap(api.workspaces[":workspaceId"].items[":itemId"].$delete({ param: { workspaceId, itemId: id } })),
    (items, id) => items.filter((i) => i.id !== id),
  );

  const error = list.error ?? parent.error ?? create.error ?? update.error ?? remove.error;
  const items = list.data?.items ?? [];
  const done = items.filter((i) => i.status === "done").length;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-neutral-500">
        <Link href={base} className="hover:text-neutral-900">
          All items
        </Link>
        {parent.data?.breadcrumbs.map((crumb) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <span>/</span>
            <Link
              href={`${base}/${crumb.id}`}
              className={crumb.id === itemId ? "font-medium text-neutral-900" : "hover:text-neutral-900"}
            >
              {crumb.title}
            </Link>
          </span>
        ))}
      </nav>

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{itemId ? (parent.data?.item.title ?? "…") : "All items"}</h1>
        {items.length > 0 && (
          <span className="text-sm text-neutral-500">
            {done}/{items.length} done
          </span>
        )}
      </div>

      <AddItemForm onAdd={(v) => create.mutate(v)} pending={create.isPending} />

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>}

      {list.isPending ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
          Nothing here yet. Add a project or a task above.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              href={`${base}/${item.id}`}
              onToggle={() =>
                update.mutate({ id: item.id, patch: { status: item.status === "done" ? "todo" : "done" } })
              }
              onRename={(title) => update.mutate({ id: item.id, patch: { title } })}
              onDelete={() => {
                const warning = item.childCount
                  ? `Delete "${item.title}" and everything inside it (${item.childCount} items)?`
                  : `Delete "${item.title}"?`;
                if (window.confirm(warning)) remove.mutate(item.id);
              }}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function AddItemForm({ onAdd, pending }: { onAdd: (v: { title: string; type: ItemType }) => void; pending: boolean }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ItemType>("task");

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd({ title: title.trim(), type });
        setTitle("");
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`Add a ${type}…`}
        aria-label="Title"
        className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 outline-none focus:border-neutral-500"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as ItemType)}
        aria-label="Type"
        className="rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm"
      >
        {itemTypes.map((t) => (
          <option key={t} value={t}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </option>
        ))}
      </select>
      <button
        disabled={pending || !title.trim()}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}

const typeBadge: Record<ItemType, string> = {
  project: "bg-indigo-50 text-indigo-700",
  task: "",
  note: "bg-amber-50 text-amber-700",
};

function ItemRow({
  item,
  href,
  onToggle,
  onRename,
  onDelete,
}: {
  item: Item;
  href: string;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const isDone = item.status === "done";

  function finishEdit(value: string) {
    setEditing(false);
    const title = value.trim();
    if (title && title !== item.title) onRename(title);
  }

  return (
    <li className="group flex items-center gap-3 px-4 py-3 hover:bg-neutral-50">
      <input
        type="checkbox"
        checked={isDone}
        onChange={onToggle}
        aria-label={`Mark "${item.title}" ${isDone ? "not done" : "done"}`}
        className="size-4 shrink-0 accent-neutral-900"
      />
      {editing ? (
        <input
          autoFocus
          defaultValue={item.title}
          aria-label="Rename"
          onBlur={(e) => finishEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finishEdit(e.currentTarget.value);
            if (e.key === "Escape") setEditing(false);
          }}
          className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-0.5"
        />
      ) : (
        <Link
          href={href}
          onDoubleClick={(e) => {
            e.preventDefault();
            setEditing(true);
          }}
          title="Open · double-click to rename"
          className={`min-w-0 flex-1 truncate ${isDone ? "text-neutral-400 line-through" : ""}`}
        >
          {item.title}
        </Link>
      )}
      {item.childCount > 0 && (
        <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
          {item.doneCount}/{item.childCount}
        </span>
      )}
      {item.type !== "task" && (
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${typeBadge[item.type]}`}>{item.type}</span>
      )}
      <button
        onClick={onDelete}
        aria-label={`Delete "${item.title}"`}
        className="shrink-0 rounded px-1.5 text-neutral-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100"
      >
        ✕
      </button>
    </li>
  );
}
