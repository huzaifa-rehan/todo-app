import { z } from "zod";

export const itemTypes = ["project", "task", "note"] as const;
export const itemStatuses = ["todo", "in_progress", "done"] as const;
export const itemPriorities = ["low", "medium", "high"] as const;
export const edgeKinds = ["flow", "blocks"] as const;

export const createItemSchema = z.object({
  parentId: z.string().uuid().nullable().default(null),
  type: z.enum(itemTypes).default("task"),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(20_000).optional(),
  status: z.enum(itemStatuses).default("todo"),
  priority: z.enum(itemPriorities).default("medium"),
  dueAt: z.coerce.date().nullable().optional(),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

// No defaults on update, so omitted fields stay unchanged.
export const updateItemSchema = z
  .object({
    parentId: z.string().uuid().nullable(),
    type: z.enum(itemTypes),
    title: z.string().trim().min(1).max(500),
    description: z.string().max(20_000).nullable(),
    status: z.enum(itemStatuses),
    priority: z.enum(itemPriorities),
    dueAt: z.coerce.date().nullable(),
  })
  .partial();
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

// Without parentId, lists the top-level items of the workspace.
export const listItemsQuerySchema = z.object({
  parentId: z.string().uuid().optional(),
});

export const boardNodePositionSchema = z.object({
  itemId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
});
export type BoardNodePosition = z.infer<typeof boardNodePositionSchema>;
