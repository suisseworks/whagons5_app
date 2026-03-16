import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    const all = await queryByTenant(ctx, "workspaces", tenantId);
    // Exclude soft-deleted
    return all.filter((w) => !w.deletedAt);
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("workspaces") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const ws = await ctx.db.get(id);
    if (!ws || ws.tenantId !== tenantId || ws.deletedAt) return null;
    return ws;
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    teams: v.optional(v.array(v.id("teams"))),
    type: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    spots: v.optional(v.array(v.string())),
    allowAdHocTasks: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("workspaces", {
      ...args,
      createdBy: user._id,
    });
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("workspaces"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    teams: v.optional(v.array(v.id("teams"))),
    type: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    spots: v.optional(v.array(v.string())),
    allowAdHocTasks: v.optional(v.boolean()),
    viewModes: v.optional(v.any()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const ws = await ctx.db.get(id);
    if (!ws || ws.tenantId !== tenantId) {
      throw new Error("Workspace not found");
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
  args: { tenantId: v.string(), id: v.id("workspaces") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const ws = await ctx.db.get(id);
    if (!ws || ws.tenantId !== tenantId) {
      throw new Error("Workspace not found");
    }
    // Soft delete
    await ctx.db.patch(id, { deletedAt: Date.now() });
  },
});
