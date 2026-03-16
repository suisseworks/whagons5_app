import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// TIME OFF TYPES
// =============================================================================

export const listTypes = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "timeOffTypes", tenantId);
  },
});

export const createType = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    requiresApproval: v.optional(v.boolean()),
    approvalId: v.optional(v.id("approvals")),
    maxDaysPerYear: v.optional(v.number()),
    isPaid: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("timeOffTypes", args);
  },
});

export const updateType = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("timeOffTypes"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    requiresApproval: v.optional(v.boolean()),
    approvalId: v.optional(v.id("approvals")),
    maxDaysPerYear: v.optional(v.number()),
    isPaid: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
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

export const removeType = mutation({
  args: { tenantId: v.string(), id: v.id("timeOffTypes") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// TIME OFF REQUESTS
// =============================================================================

export const listRequests = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "timeOffRequests", tenantId);
  },
});

export const listMyRequests = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const { user } = await withTenant(ctx, tenantId);
    return ctx.db
      .query("timeOffRequests")
      .withIndex("by_userId", (q) => q.eq("tenantId", tenantId).eq("userId", user._id))
      .collect();
  },
});

export const createRequest = mutation({
  args: {
    tenantId: v.string(),
    timeOffTypeId: v.id("timeOffTypes"),
    startDate: v.number(),
    endDate: v.number(),
    startHalfDay: v.optional(v.boolean()),
    endHalfDay: v.optional(v.boolean()),
    totalDays: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("timeOffRequests", {
      ...args,
      userId: user._id,
      status: "pending",
      createdBy: user._id,
    });
  },
});

export const updateRequest = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("timeOffRequests"),
    status: v.optional(v.string()),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
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

export const removeRequest = mutation({
  args: { tenantId: v.string(), id: v.id("timeOffRequests") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// TIME OFF APPROVAL INSTANCES
// =============================================================================

export const listApprovalInstances = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "timeOffApprovalInstances", tenantId);
  },
});

export const createApprovalInstance = mutation({
  args: {
    tenantId: v.string(),
    timeOffRequestId: v.id("timeOffRequests"),
    approvalId: v.optional(v.id("approvals")),
    approverUserId: v.id("users"),
    sourceApproverId: v.optional(v.id("approvalApprovers")),
    orderIndex: v.optional(v.number()),
    isRequired: v.optional(v.boolean()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("timeOffApprovalInstances", args);
  },
});

export const updateApprovalInstance = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("timeOffApprovalInstances"),
    status: v.optional(v.string()),
    notifiedAt: v.optional(v.number()),
    respondedAt: v.optional(v.number()),
    responseComment: v.optional(v.string()),
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

// =============================================================================
// TIME OFF APPROVAL DECISIONS
// =============================================================================

export const listApprovalDecisions = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "timeOffApprovalDecisions", tenantId);
  },
});

export const createApprovalDecision = mutation({
  args: {
    tenantId: v.string(),
    timeOffRequestId: v.id("timeOffRequests"),
    approvalId: v.optional(v.id("approvals")),
    approverUserId: v.id("users"),
    decision: v.string(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("timeOffApprovalDecisions", {
      ...args,
      decidedByUserId: user._id,
    });
  },
});
