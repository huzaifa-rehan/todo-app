"use client";

import "@xyflow/react/dist/style.css";
import type { itemTypes } from "@ability/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type OnConnectEnd,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ViewSwitch } from "@/components/view-switch";
import { api, type Board as BoardData, type BoardItem, invalidateWorkspace, unwrap } from "@/lib/api";
import { type ItemNode, ItemNodeCard, type ItemNodeData } from "./item-node";

type ItemType = (typeof itemTypes)[number];
type Point = { x: number; y: number };

const nodeTypes = { item: ItemNodeCard };
const CARD = { w: 240, h: 90 };
const GRID = { cols: 4, w: 290, h: 150 };

// Items that were never placed get a grid slot below the placed ones.
function layout(items: BoardItem[]) {
  const positions = new Map<string, Point>();
  let bottom = -Infinity;
  let left = Infinity;
  for (const item of items) {
    if (item.x === null || item.y === null) continue;
    positions.set(item.id, { x: item.x, y: item.y });
    bottom = Math.max(bottom, item.y);
    left = Math.min(left, item.x);
  }
  const origin = positions.size ? { x: left, y: bottom + GRID.h } : { x: 0, y: 0 };
  let slot = 0;
  for (const item of items) {
    if (positions.has(item.id)) continue;
    positions.set(item.id, {
      x: origin.x + (slot % GRID.cols) * GRID.w,
      y: origin.y + Math.floor(slot / GRID.cols) * GRID.h,
    });
    slot++;
  }
  return positions;
}

function toEdge(e: BoardData["edges"][number]): Edge {
  const blocks = e.kind === "blocks";
  return {
    id: e.id,
    source: e.sourceItemId,
    target: e.targetItemId,
    type: "smoothstep",
    label: e.label ?? undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: blocks ? "#dc2626" : "#737373" },
    style: blocks ? { stroke: "#dc2626", strokeDasharray: "6 4" } : { stroke: "#737373", strokeWidth: 1.5 },
  };
}

export function Board({ workspaceId, itemId }: { workspaceId: string; itemId?: string }) {
  return (
    <ReactFlowProvider>
      {/* A fresh canvas per board so viewport and selection don't leak between levels. */}
      <BoardCanvas key={itemId ?? "root"} workspaceId={workspaceId} itemId={itemId} />
    </ReactFlowProvider>
  );
}

function BoardCanvas({ workspaceId, itemId }: { workspaceId: string; itemId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const rf = useReactFlow<ItemNode>();
  const wrapper = useRef<HTMLDivElement>(null);
  const boardKey = ["board", workspaceId, itemId ?? "root"];
  const boardUrl = (id?: string) => `/w/${workspaceId}/board${id ? `/${id}` : ""}`;

  const board = useQuery({
    queryKey: boardKey,
    queryFn: () =>
      unwrap(api.workspaces[":workspaceId"].board.$get({ param: { workspaceId }, query: { ownerId: itemId } })),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<ItemNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Cancels in-flight refetches first, so a response started before this change can't overwrite it.
  const setBoard = async (fn: (b: BoardData) => BoardData) => {
    await queryClient.cancelQueries({ queryKey: boardKey });
    queryClient.setQueryData<BoardData>(boardKey, (b) => (b ? fn(b) : b));
  };
  // Refetch only when the last pending change settles; an earlier refetch would miss the later ones.
  const mutationKey = ["board-change", workspaceId];
  const refresh = () => {
    if (queryClient.isMutating({ mutationKey }) <= 1) void invalidateWorkspace(queryClient, workspaceId);
  };
  const item = api.workspaces[":workspaceId"].items;
  const boardApi = api.workspaces[":workspaceId"].board;

  const createItem = useMutation({
    mutationKey,
    mutationFn: (v: { title: string; type: ItemType; position: Point }) =>
      unwrap(item.$post({ param: { workspaceId }, json: { ...v, parentId: itemId ?? null } })),
    onSuccess: ({ item: created }, v) =>
      setBoard((b) => ({ ...b, items: [...b.items, { ...created, ...v.position }] })),
    onSettled: refresh,
  });

  const updateItem = useMutation({
    mutationKey,
    mutationFn: (v: { id: string; patch: { title?: string; status?: BoardItem["status"] } }) =>
      unwrap(item[":itemId"].$patch({ param: { workspaceId, itemId: v.id }, json: v.patch })),
    onMutate: (v) =>
      setBoard((b) => ({ ...b, items: b.items.map((i) => (i.id === v.id ? { ...i, ...v.patch } : i)) })),
    onSettled: refresh,
  });

  const deleteItem = useMutation({
    mutationKey,
    mutationFn: (id: string) => unwrap(item[":itemId"].$delete({ param: { workspaceId, itemId: id } })),
    onMutate: (id) =>
      setBoard((b) => ({
        ...b,
        items: b.items.filter((i) => i.id !== id),
        edges: b.edges.filter((e) => e.sourceItemId !== id && e.targetItemId !== id),
      })),
    onSettled: refresh,
  });

  const savePositions = useMutation({
    mutationKey,
    mutationFn: (positions: { itemId: string; x: number; y: number }[]) =>
      unwrap(boardApi.positions.$put({ param: { workspaceId }, json: { positions } })),
    onMutate: (positions) => {
      const byId = new Map(positions.map((p) => [p.itemId, p]));
      return setBoard((b) => ({ ...b, items: b.items.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id)! } : i)) }));
    },
    onError: refresh,
  });

  const createEdge = useMutation({
    mutationKey,
    mutationFn: (v: { sourceItemId: string; targetItemId: string }) =>
      unwrap(boardApi.edges.$post({ param: { workspaceId }, json: v })),
    onMutate: (v) =>
      setBoard((b) => ({
        ...b,
        edges: [...b.edges, { id: `temp-${v.sourceItemId}-${v.targetItemId}`, kind: "flow", label: null, ...v }],
      })),
    onSettled: refresh,
  });

  const deleteEdge = useMutation({
    mutationKey,
    mutationFn: (edgeId: string) => unwrap(boardApi.edges[":edgeId"].$delete({ param: { workspaceId, edgeId } })),
    onMutate: (edgeId) => setBoard((b) => ({ ...b, edges: b.edges.filter((e) => e.id !== edgeId) })),
    onSettled: refresh,
  });

  function addItem(type: ItemType, center: Point, connectFrom?: { id: string; asSource: boolean }) {
    createItem.mutate(
      { title: `New ${type}`, type, position: { x: center.x - CARD.w / 2, y: center.y - CARD.h / 2 } },
      {
        onSuccess: ({ item: created }) => {
          setEditingId(created.id);
          if (!connectFrom) return;
          createEdge.mutate(
            connectFrom.asSource
              ? { sourceItemId: connectFrom.id, targetItemId: created.id }
              : { sourceItemId: created.id, targetItemId: connectFrom.id },
          );
        },
      },
    );
  }

  function addAtViewCenter(type: ItemType) {
    const rect = wrapper.current!.getBoundingClientRect();
    // Small jitter so repeated clicks don't stack cards exactly on top of each other.
    const jitter = () => (Math.random() - 0.5) * 60;
    addItem(type, rf.screenToFlowPosition({ x: rect.left + rect.width / 2 + jitter(), y: rect.top + rect.height / 2 + jitter() }));
  }

  // Zoom into the card, then navigate to its own board.
  function open(target: BoardItem) {
    const node = rf.getNode(target.id);
    if (node) {
      const w = node.measured?.width ?? CARD.w;
      const h = node.measured?.height ?? CARD.h;
      void rf.setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: 2.5, duration: 350 });
    }
    setTimeout(() => router.push(boardUrl(target.id)), node ? 300 : 0);
  }

  function goUp() {
    if (!itemId) return;
    const crumbs = board.data?.breadcrumbs ?? [];
    void rf.zoomTo(rf.getZoom() * 0.4, { duration: 250 });
    setTimeout(() => router.push(boardUrl(crumbs.at(-2)?.id)), 220);
  }

  // Node callbacks read the latest handlers through a ref, so the node data stays stable.
  const handlers = useRef<Omit<ItemNodeData, "item" | "editing">>(null!);
  handlers.current = {
    onToggle: (i) => updateItem.mutate({ id: i.id, patch: { status: i.status === "done" ? "todo" : "done" } }),
    onRename: (i, title) => {
      setEditingId(null);
      const next = title?.trim();
      if (next && next !== i.title) updateItem.mutate({ id: i.id, patch: { title: next } });
    },
    onStartRename: (i) => setEditingId(i.id),
    onDelete: (i) => {
      const message = i.childCount
        ? `Delete "${i.title}" and everything inside it (${i.childCount} items)?`
        : `Delete "${i.title}"?`;
      if (window.confirm(message)) deleteItem.mutate(i.id);
    },
    onOpen: open,
  };
  const stableHandlers = useMemo<Omit<ItemNodeData, "item" | "editing">>(
    () => ({
      onToggle: (i) => handlers.current.onToggle(i),
      onRename: (i, t) => handlers.current.onRename(i, t),
      onStartRename: (i) => handlers.current.onStartRename(i),
      onDelete: (i) => handlers.current.onDelete(i),
      onOpen: (i) => handlers.current.onOpen(i),
    }),
    [],
  );

  // Rebuild the canvas whenever the server data (or the card being renamed) changes.
  useEffect(() => {
    if (!board.data) return;
    const positions = layout(board.data.items);
    setNodes((prev) => {
      const selected = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return board.data.items.map((i) => ({
        id: i.id,
        type: "item" as const,
        position: positions.get(i.id)!,
        selected: selected.has(i.id),
        deletable: false,
        data: { item: i, editing: editingId === i.id, ...stableHandlers },
      }));
    });
    setEdges(board.data.edges.map(toEdge));
  }, [board.data, editingId, setNodes, setEdges, stableHandlers]);

  // Frame the board once its cards have been measured.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || nodes.length === 0 || !nodes.every((n) => n.measured)) return;
    framed.current = true;
    void rf.fitView({ padding: 0.25, maxZoom: 1.1, duration: 300 });
  }, [nodes, rf]);

  // Esc goes up a level (unless typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const typing =
        el.isContentEditable ||
        el.matches("textarea, select") ||
        (el instanceof HTMLInputElement && !["checkbox", "radio", "button"].includes(el.type));
      if (e.key !== "Escape" || editingId || typing) return;
      goUp();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Dropping a connection on empty space creates a connected task there.
  const onConnectEnd: OnConnectEnd = (event, state) => {
    if (!state.fromNode || state.toNode) return;
    const point = "changedTouches" in event ? event.changedTouches[0]! : event;
    addItem("task", rf.screenToFlowPosition({ x: point.clientX, y: point.clientY }), {
      id: state.fromNode.id,
      asSource: state.fromHandle?.type !== "target",
    });
  };

  const error =
    board.error ?? createItem.error ?? updateItem.error ?? deleteItem.error ?? savePositions.error ?? createEdge.error ?? deleteEdge.error;
  const owner = board.data?.owner;

  return (
    <div
      ref={wrapper}
      className="h-[calc(100dvh-3.5rem)] w-full"
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).classList.contains("react-flow__pane")) {
          addItem("task", rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        }
      }}
    >
      <ReactFlow<ItemNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(c: Connection) => createEdge.mutate({ sourceItemId: c.source, targetItemId: c.target })}
        onConnectEnd={onConnectEnd}
        onNodeDoubleClick={(_, node) => open(node.data.item)}
        onNodeDragStop={(_, __, dragged) => {
          // Also pin never-placed cards, so they don't shift when the grid below the placed ones moves.
          const unplaced = new Set(board.data?.items.filter((i) => i.x === null).map((i) => i.id));
          const moved = new Map(dragged.map((n) => [n.id, n]));
          for (const n of rf.getNodes()) if (unplaced.has(n.id)) moved.set(n.id, n);
          savePositions.mutate([...moved.values()].map((n) => ({ itemId: n.id, x: n.position.x, y: n.position.y })));
        }}
        onEdgesDelete={(deleted) =>
          deleted.filter((e) => !e.id.startsWith("temp-")).forEach((e) => deleteEdge.mutate(e.id))
        }
        deleteKeyCode={["Delete", "Backspace"]}
        zoomOnDoubleClick={false}
        minZoom={0.1}
        maxZoom={3}
        colorMode="light"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#d4d4d4" />
        <Controls showInteractive={false} />
        <MiniMap<ItemNode>
          pannable
          zoomable
          nodeColor={(n) => (n.data.item.type === "project" ? "#a5b4fc" : "#d4d4d4")}
        />

        <Panel position="top-left" className="max-w-[60vw] rounded-xl border border-neutral-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
          <Breadcrumbs
            base={`/w/${workspaceId}/board`}
            crumbs={board.data?.breadcrumbs ?? []}
            currentId={itemId}
          />
          <h1 className="truncate text-lg font-semibold">{itemId ? (owner?.title ?? "…") : "All items"}</h1>
        </Panel>

        <Panel position="top-right" className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
            {(["task", "project", "note"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addAtViewCenter(type)}
                className="border-r border-neutral-200 px-3 py-1.5 text-sm last:border-r-0 hover:bg-neutral-50"
              >
                + {type[0]!.toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
          <ViewSwitch workspaceId={workspaceId} itemId={itemId} current="board" />
        </Panel>

        {error && (
          <Panel position="top-center" className="mt-16 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
            {error.message}
          </Panel>
        )}

        {board.data && board.data.items.length === 0 && (
          <Panel position="top-center" className="pointer-events-none mt-[30vh] text-center text-sm text-neutral-500">
            <p className="text-base font-medium text-neutral-700">This board is empty</p>
            <p>Double-click anywhere to add a task, or use the buttons at the top right.</p>
          </Panel>
        )}

        <Panel position="bottom-center" className="hidden rounded-lg bg-white/80 px-3 py-1.5 text-xs text-neutral-500 shadow-sm md:block">
          Double-click empty space to add · drag from a card&apos;s dot to connect · double-click a card to open it
          {itemId ? " · Esc to go up" : ""}
        </Panel>
      </ReactFlow>
    </div>
  );
}
