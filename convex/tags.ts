import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "tags", tenantId);
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("tags") },
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
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("tags", args);
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("tags"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Tag not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("tags") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Tag not found");
    await ctx.db.delete(id);
  },
});
