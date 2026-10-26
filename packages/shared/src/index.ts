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

export const updateItemSchema = createItemSchema.partial();
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const boardNodePositionSchema = z.object({
  itemId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
});
export type BoardNodePosition = z.infer<typeof boardNodePositionSchema>;
