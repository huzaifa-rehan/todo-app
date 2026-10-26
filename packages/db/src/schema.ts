import { edgeKinds, itemPriorities, itemStatuses, itemTypes } from "@ability/shared";
import {
  type AnyPgColumn,
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const itemType = pgEnum("item_type", itemTypes);
export const itemStatus = pgEnum("item_status", itemStatuses);
export const itemPriority = pgEnum("item_priority", itemPriorities);
export const edgeKind = pgEnum("edge_kind", edgeKinds);
export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// Better Auth owns the user/session tables; members reference users by id.
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const members = pgTable(
  "members",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: memberRole("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

// Every project/task/note is an item. Any item can have children: that is the nesting.
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => items.id, { onDelete: "cascade" }),
    type: itemType("type").notNull().default("task"),
    title: text("title").notNull(),
    description: text("description"),
    status: itemStatus("status").notNull().default("todo"),
    priority: itemPriority("priority").notNull().default("medium"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    assigneeId: text("assignee_id"),
    sortOrder: real("sort_order").notNull().default(0),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("items_workspace_parent_idx").on(t.workspaceId, t.parentId)],
);

// Where an item sits on a board. boardOwnerId is the parent item whose board this is (null = root board).
export const boardNodes = pgTable(
  "board_nodes",
  {
    itemId: uuid("item_id").primaryKey().references(() => items.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    boardOwnerId: uuid("board_owner_id").references(() => items.id, { onDelete: "cascade" }),
    x: real("x").notNull().default(0),
    y: real("y").notNull().default(0),
    w: real("w"),
    h: real("h"),
    color: text("color"),
    collapsed: boolean("collapsed").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("board_nodes_board_idx").on(t.workspaceId, t.boardOwnerId)],
);

export const edges = pgTable(
  "edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    boardOwnerId: uuid("board_owner_id").references(() => items.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    targetItemId: uuid("target_item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    kind: edgeKind("kind").notNull().default("flow"),
    label: text("label"),
    ...timestamps,
  },
  (t) => [index("edges_board_idx").on(t.workspaceId, t.boardOwnerId)],
);
