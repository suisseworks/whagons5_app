import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "teams", tenantId);
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("teams") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const team = await ctx.db.get(id);
    if (!team || team.tenantId !== tenantId) return null;
    return team;
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    allowMultitasking: v.optional(v.boolean()),
    parentTeamId: v.optional(v.id("teams")),
    teamLeadId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("teams", args);
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("teams"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    allowMultitasking: v.optional(v.boolean()),
    parentTeamId: v.optional(v.id("teams")),
    teamLeadId: v.optional(v.id("users")),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    const { user } = await withTenant(ctx, tenantId);
    const team = await ctx.db.get(id);
    if (!team || team.tenantId !== tenantId) {
      throw new Error("Team not found");
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
  args: { tenantId: v.string(), id: v.id("teams") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const team = await ctx.db.get(id);
    if (!team || team.tenantId !== tenantId) {
      throw new Error("Team not found");
    }
    await ctx.db.delete(id);
  },
});
