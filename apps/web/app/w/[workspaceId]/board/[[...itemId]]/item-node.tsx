"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import type { BoardItem } from "@/lib/api";

export type ItemNodeData = {
  item: BoardItem;
  editing: boolean;
  onToggle: (item: BoardItem) => void;
  onRename: (item: BoardItem, title: string | null) => void;
  onStartRename: (item: BoardItem) => void;
  onDelete: (item: BoardItem) => void;
  onOpen: (item: BoardItem) => void;
};

export type ItemNode = Node<ItemNodeData, "item">;

const typeStyles = {
  project: { card: "border-indigo-200 bg-white", badge: "bg-indigo-50 text-indigo-700", bar: "bg-indigo-500" },
  task: { card: "border-neutral-200 bg-white", badge: "bg-neutral-100 text-neutral-600", bar: "bg-neutral-700" },
  note: { card: "border-amber-200 bg-amber-50", badge: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
} as const;

const handleClass = "!size-3 !border-2 !border-white !bg-neutral-400 hover:!bg-neutral-700";

export function ItemNodeCard({ data, selected }: NodeProps<ItemNode>) {
  const { item, editing } = data;
  const style = typeStyles[item.type];
  const isDone = item.status === "done";
  const progress = item.childCount ? Math.round((item.doneCount / item.childCount) * 100) : 0;

  return (
    <div
      className={`group w-60 rounded-xl border shadow-sm transition-shadow ${style.card} ${
        selected ? "ring-2 ring-neutral-900/70" : "hover:shadow-md"
      } ${isDone ? "opacity-60" : ""}`}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />

      <div className="flex items-start gap-2 px-3 pt-3">
        {item.type !== "note" && (
          <input
            type="checkbox"
            checked={isDone}
            onChange={() => data.onToggle(item)}
            aria-label={`Mark "${item.title}" ${isDone ? "not done" : "done"}`}
            className="nodrag mt-1 size-4 shrink-0 cursor-pointer accent-neutral-900"
          />
        )}
        {editing ? (
          <input
            autoFocus
            defaultValue={item.title}
            aria-label="Title"
            onFocus={(e) => e.currentTarget.select()}
            onDoubleClick={(e) => e.stopPropagation()}
            onBlur={(e) => data.onRename(item, e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") data.onRename(item, null);
            }}
            className="nodrag min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-sm"
          />
        ) : (
          <p
            className={`min-w-0 flex-1 break-words text-sm font-medium leading-snug ${isDone ? "line-through" : ""}`}
          >
            {item.title}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 pt-2 pb-3">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${style.badge}`}>{item.type}</span>
        {item.childCount > 0 && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5" title={`${item.doneCount} of ${item.childCount} done`}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
              <div className={`h-full ${style.bar}`} style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[11px] text-neutral-500 tabular-nums">
              {item.doneCount}/{item.childCount}
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <IconButton label={`Rename "${item.title}"`} onClick={() => data.onStartRename(item)}>
            ✎
          </IconButton>
          <IconButton label={`Delete "${item.title}"`} onClick={() => data.onDelete(item)} danger>
            ✕
          </IconButton>
          <IconButton label={`Open "${item.title}"`} onClick={() => data.onOpen(item)}>
            ↗
          </IconButton>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className={handleClass} />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`nodrag rounded px-1 text-xs text-neutral-400 ${
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      {children}
    </button>
  );
}
