import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    const all = await queryByTenant(ctx, "categories", tenantId);
    return all.filter((c) => !c.deletedAt);
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("categories") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId || doc.deletedAt) return null;
    return doc;
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    slaId: v.optional(v.id("slas")),
    teamId: v.optional(v.id("teams")),
    workspaceId: v.optional(v.id("workspaces")),
    taskCreationMode: v.optional(v.string()),
    spotsNotApplicable: v.optional(v.boolean()),
    statusTransitionGroupId: v.optional(v.id("statusTransitionGroups")),
    approvalId: v.optional(v.id("approvals")),
    defaultPriorityId: v.optional(v.id("priorities")),
    defaultSpotId: v.optional(v.id("spots")),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("categories", args);
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("categories"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    slaId: v.optional(v.id("slas")),
    teamId: v.optional(v.id("teams")),
    workspaceId: v.optional(v.id("workspaces")),
    taskCreationMode: v.optional(v.string()),
    spotsNotApplicable: v.optional(v.boolean()),
    statusTransitionGroupId: v.optional(v.id("statusTransitionGroups")),
    approvalId: v.optional(v.id("approvals")),
    defaultPriorityId: v.optional(v.id("priorities")),
    defaultSpotId: v.optional(v.id("spots")),
    dialogLayout: v.optional(v.any()),
    reportingTeamIds: v.optional(v.any()),
    celebrationEffect: v.optional(v.string()),
    notificationTone: v.optional(v.string()),
    allowTemplatelessTasks: v.optional(v.boolean()),
    defaultUserIds: v.optional(v.any()),
    defaultTagIds: v.optional(v.any()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Category not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("categories") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Category not found");
    await ctx.db.patch(id, { deletedAt: Date.now() });
  },
});

// --- Category Priorities (pivot) ---

export const listPriorities = query({
  args: { tenantId: v.string(), categoryId: v.id("categories") },
  handler: async (ctx, { tenantId, categoryId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("categoryPriorities")
      .withIndex("by_categoryId", (q) => q.eq("tenantId", tenantId).eq("categoryId", categoryId))
      .collect();
  },
});

export const setPriority = mutation({
  args: {
    tenantId: v.string(),
    categoryId: v.id("categories"),
    priorityId: v.id("priorities"),
    slaId: v.optional(v.id("slas")),
  },
  handler: async (ctx, { tenantId, categoryId, priorityId, slaId }) => {
    await withTenant(ctx, tenantId);
    // Upsert: check if exists
    const existing = await ctx.db
      .query("categoryPriorities")
      .withIndex("by_categoryId", (q) => q.eq("tenantId", tenantId).eq("categoryId", categoryId))
      .filter((q) => q.eq(q.field("priorityId"), priorityId))
      .first();
    if (existing) {
      if (slaId !== undefined) await ctx.db.patch(existing._id, { slaId });
      return existing._id;
    }
    return ctx.db.insert("categoryPriorities", { tenantId, categoryId, priorityId, slaId });
  },
});

export const removePriority = mutation({
  args: { tenantId: v.string(), id: v.id("categoryPriorities") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
