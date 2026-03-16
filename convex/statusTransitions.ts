import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// STATUS TRANSITION GROUPS
// =============================================================================

export const listGroups = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "statusTransitionGroups", tenantId);
  },
});

export const getGroup = query({
  args: { tenantId: v.string(), id: v.id("statusTransitionGroups") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) return null;
    return doc;
  },
});

export const createGroup = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("statusTransitionGroups", args);
  },
});

export const updateGroup = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("statusTransitionGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Group not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const removeGroup = mutation({
  args: { tenantId: v.string(), id: v.id("statusTransitionGroups") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// STATUS TRANSITIONS
// =============================================================================

export const listTransitions = query({
  args: { tenantId: v.string(), groupId: v.id("statusTransitionGroups") },
  handler: async (ctx, { tenantId, groupId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("statusTransitions")
      .withIndex("by_groupId", (q) =>
        q.eq("tenantId", tenantId).eq("statusTransitionGroupId", groupId),
      )
      .collect();
  },
});

export const createTransition = mutation({
  args: {
    tenantId: v.string(),
    statusTransitionGroupId: v.id("statusTransitionGroups"),
    fromStatus: v.optional(v.id("statuses")),
    toStatus: v.id("statuses"),
    initial: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("statusTransitions", args);
  },
});

export const removeTransition = mutation({
  args: { tenantId: v.string(), id: v.id("statusTransitions") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// WORKFLOWS
// =============================================================================

export const listWorkflows = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "workflows", tenantId);
  },
});

export const getWorkflow = query({
  args: { tenantId: v.string(), id: v.id("workflows") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) return null;
    return doc;
  },
});

export const createWorkflow = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("workflows", { ...args, createdBy: user._id });
  },
});

export const updateWorkflow = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("workflows"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    isActive: v.optional(v.boolean()),
    currentVersionId: v.optional(v.string()),
    activatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    const { user } = await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Workflow not found");
    const patch: Record<string, any> = { updatedBy: user._id };
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    await ctx.db.patch(id, patch);
    return id;
  },
});

export const removeWorkflow = mutation({
  args: { tenantId: v.string(), id: v.id("workflows") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
