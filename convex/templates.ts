import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "templates", tenantId);
  },
});

export const byCategory = query({
  args: { tenantId: v.string(), categoryId: v.id("categories") },
  handler: async (ctx, { tenantId, categoryId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("templates")
      .withIndex("by_categoryId", (q) => q.eq("tenantId", tenantId).eq("categoryId", categoryId))
      .collect();
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("templates") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) return null;
    return doc;
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    alias: v.optional(v.string()),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    priorityId: v.optional(v.id("priorities")),
    slaId: v.optional(v.id("slas")),
    approvalId: v.optional(v.id("approvals")),
    defaultSpotId: v.optional(v.id("spots")),
    spotsNotApplicable: v.optional(v.boolean()),
    expectedDuration: v.optional(v.number()),
    defaultUserIds: v.optional(v.any()),
    formId: v.optional(v.id("forms")),
    enabled: v.optional(v.boolean()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("templates", args);
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("templates"),
    name: v.optional(v.string()),
    alias: v.optional(v.string()),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    priorityId: v.optional(v.id("priorities")),
    slaId: v.optional(v.id("slas")),
    approvalId: v.optional(v.id("approvals")),
    defaultSpotId: v.optional(v.id("spots")),
    spotsNotApplicable: v.optional(v.boolean()),
    expectedDuration: v.optional(v.number()),
    defaultUserIds: v.optional(v.any()),
    formId: v.optional(v.id("forms")),
    enabled: v.optional(v.boolean()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Template not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("templates") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Template not found");
    await ctx.db.delete(id);
  },
});
