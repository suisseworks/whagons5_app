import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "spots", tenantId);
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("spots") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) return null;
    return doc;
  },
});

export const byParent = query({
  args: { tenantId: v.string(), parentId: v.optional(v.id("spots")) },
  handler: async (ctx, { tenantId, parentId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("spots")
      .withIndex("by_parentId", (q) => q.eq("tenantId", tenantId).eq("parentId", parentId))
      .collect();
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    alias: v.optional(v.string()),
    parentId: v.optional(v.id("spots")),
    spotTypeId: v.optional(v.id("spotTypes")),
    isBranch: v.optional(v.boolean()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("spots", args);
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("spots"),
    name: v.optional(v.string()),
    alias: v.optional(v.string()),
    parentId: v.optional(v.id("spots")),
    spotTypeId: v.optional(v.id("spotTypes")),
    isBranch: v.optional(v.boolean()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Spot not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("spots") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Spot not found");
    await ctx.db.delete(id);
  },
});
