import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "statuses", tenantId);
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("statuses") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const status = await ctx.db.get(id);
    if (!status || status.tenantId !== tenantId) return null;
    return status;
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    action: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    system: v.optional(v.boolean()),
    initial: v.optional(v.boolean()),
    final: v.optional(v.boolean()),
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("statuses", args);
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("statuses"),
    name: v.optional(v.string()),
    action: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    system: v.optional(v.boolean()),
    initial: v.optional(v.boolean()),
    final: v.optional(v.boolean()),
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const status = await ctx.db.get(id);
    if (!status || status.tenantId !== tenantId) {
      throw new Error("Status not found");
    }
    const patch: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(id, patch);
    }
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("statuses") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const status = await ctx.db.get(id);
    if (!status || status.tenantId !== tenantId) {
      throw new Error("Status not found");
    }
    await ctx.db.delete(id);
  },
});
