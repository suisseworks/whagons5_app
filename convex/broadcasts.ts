import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// BROADCASTS
// =============================================================================

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "broadcasts", tenantId);
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("broadcasts") },
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
    title: v.string(),
    message: v.optional(v.string()),
    priority: v.optional(v.string()),
    recipientSelectionType: v.optional(v.string()),
    totalRecipients: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    status: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("broadcasts", {
      ...args,
      createdBy: user._id,
      totalAcknowledged: 0,
    });
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("broadcasts"),
    title: v.optional(v.string()),
    message: v.optional(v.string()),
    priority: v.optional(v.string()),
    status: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    totalRecipients: v.optional(v.number()),
    totalAcknowledged: v.optional(v.number()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Broadcast not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("broadcasts") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// BROADCAST ACKNOWLEDGMENTS
// =============================================================================

export const listAllAcknowledgments = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "broadcastAcknowledgments", tenantId);
  },
});

export const listAcknowledgments = query({
  args: { tenantId: v.string(), broadcastId: v.id("broadcasts") },
  handler: async (ctx, { tenantId, broadcastId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("broadcastAcknowledgments")
      .withIndex("by_broadcastId", (q) => q.eq("tenantId", tenantId).eq("broadcastId", broadcastId))
      .collect();
  },
});

export const acknowledgeBroadcast = mutation({
  args: { tenantId: v.string(), broadcastId: v.id("broadcasts") },
  handler: async (ctx, { tenantId, broadcastId }) => {
    const { user } = await withTenant(ctx, tenantId);
    // Prevent duplicate
    const existing = await ctx.db
      .query("broadcastAcknowledgments")
      .withIndex("by_broadcastId", (q) => q.eq("tenantId", tenantId).eq("broadcastId", broadcastId))
      .filter((q) => q.eq(q.field("userId"), user._id))
      .first();
    if (existing) return existing._id;
    const id = await ctx.db.insert("broadcastAcknowledgments", {
      tenantId,
      broadcastId,
      userId: user._id,
      status: "acknowledged",
      acknowledgedAt: Date.now(),
    });
    // Increment counter on broadcast
    const broadcast = await ctx.db.get(broadcastId);
    if (broadcast) {
      await ctx.db.patch(broadcastId, {
        totalAcknowledged: (broadcast.totalAcknowledged ?? 0) + 1,
      });
    }
    return id;
  },
});
