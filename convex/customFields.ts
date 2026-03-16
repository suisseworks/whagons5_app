import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// --- Custom Fields ---

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "customFields", tenantId);
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    fieldType: v.string(),
    options: v.optional(v.any()),
    validationRules: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("customFields", args);
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("customFields"),
    name: v.optional(v.string()),
    fieldType: v.optional(v.string()),
    options: v.optional(v.any()),
    validationRules: v.optional(v.any()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("customFields") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// --- Category Custom Fields (pivot) ---

export const listByCategory = query({
  args: { tenantId: v.string(), categoryId: v.id("categories") },
  handler: async (ctx, { tenantId, categoryId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("categoryCustomFields")
      .withIndex("by_categoryId", (q) => q.eq("tenantId", tenantId).eq("categoryId", categoryId))
      .collect();
  },
});

export const assignToCategory = mutation({
  args: {
    tenantId: v.string(),
    fieldId: v.id("customFields"),
    categoryId: v.id("categories"),
    isRequired: v.optional(v.boolean()),
    order: v.optional(v.number()),
    defaultValue: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("categoryCustomFields", args);
  },
});

export const removeFromCategory = mutation({
  args: { tenantId: v.string(), id: v.id("categoryCustomFields") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// --- Task Custom Field Values ---

export const listTaskValues = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("taskCustomFieldValues")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .collect();
  },
});

export const setTaskValue = mutation({
  args: {
    tenantId: v.string(),
    taskId: v.id("tasks"),
    fieldId: v.id("customFields"),
    value: v.optional(v.any()),
    valueNumeric: v.optional(v.number()),
    valueDate: v.optional(v.number()),
    valueJson: v.optional(v.any()),
  },
  handler: async (ctx, { tenantId, taskId, fieldId, ...values }) => {
    await withTenant(ctx, tenantId);
    // Upsert
    const existing = await ctx.db
      .query("taskCustomFieldValues")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .filter((q) => q.eq(q.field("fieldId"), fieldId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, values);
      return existing._id;
    }
    return ctx.db.insert("taskCustomFieldValues", { tenantId, taskId, fieldId, ...values });
  },
});
