import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "approvals", tenantId);
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(), name: v.string(), description: v.optional(v.string()),
    approvalType: v.optional(v.string()), requireAll: v.optional(v.boolean()),
    minimumApprovals: v.optional(v.number()), triggerType: v.optional(v.string()),
    triggerConditions: v.optional(v.any()), isActive: v.optional(v.boolean()),
    triggerStatusId: v.optional(v.id("statuses")),
  },
  handler: async (ctx, args) => { await withTenant(ctx, args.tenantId); return ctx.db.insert("approvals", args); },
});

export const update = mutation({
  args: {
    tenantId: v.string(), id: v.id("approvals"), name: v.optional(v.string()),
    description: v.optional(v.string()), approvalType: v.optional(v.string()),
    requireAll: v.optional(v.boolean()), minimumApprovals: v.optional(v.number()),
    triggerType: v.optional(v.string()), triggerConditions: v.optional(v.any()),
    isActive: v.optional(v.boolean()), triggerStatusId: v.optional(v.id("statuses")),
    onApprovedActions: v.optional(v.any()), onRejectedActions: v.optional(v.any()),
  },
  handler: async (ctx, { tenantId, id, ...u }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(u)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("approvals") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId); const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// --- Approval Approvers ---
export const listApprovers = query({
  args: { tenantId: v.string(), approvalId: v.id("approvals") },
  handler: async (ctx, { tenantId, approvalId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("approvalApprovers").withIndex("by_approvalId", (q) => q.eq("tenantId", tenantId).eq("approvalId", approvalId)).collect();
  },
});

// --- Task Approval Instances ---
export const listTaskApprovals = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("taskApprovalInstances").withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId)).collect();
  },
});

export const decide = mutation({
  args: {
    tenantId: v.string(), instanceId: v.id("taskApprovalInstances"),
    status: v.string(), responseComment: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, instanceId, status, responseComment }) => {
    await withTenant(ctx, tenantId);
    const inst = await ctx.db.get(instanceId);
    if (!inst || inst.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.patch(instanceId, { status, responseComment, respondedAt: Date.now() });
    return instanceId;
  },
});
