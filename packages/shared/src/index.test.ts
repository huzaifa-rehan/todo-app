import { describe, expect, it } from "vitest";
import { createItemSchema, updateItemSchema } from "./index";

describe("createItemSchema", () => {
  it("applies defaults for a bare title", () => {
    expect(createItemSchema.parse({ title: "  Ship 0.1 " })).toMatchObject({
      title: "Ship 0.1",
      type: "task",
      status: "todo",
      parentId: null,
    });
  });

  it("rejects an empty title", () => {
    expect(createItemSchema.safeParse({ title: "   " }).success).toBe(false);
  });
});

describe("updateItemSchema", () => {
  it("leaves omitted fields out instead of defaulting them", () => {
    expect(updateItemSchema.parse({ status: "done" })).toEqual({ status: "done" });
  });
});
