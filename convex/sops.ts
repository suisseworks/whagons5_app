import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// SOPs (Standard Operating Procedures)
// =============================================================================

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "sops", tenantId);
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("sops") },
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
    description: v.optional(v.string()),
    code: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    approvalId: v.optional(v.id("approvals")),
    documentId: v.optional(v.id("documents")),
    effectiveDate: v.optional(v.number()),
    reviewDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("sops", { ...args, createdBy: user._id });
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("sops"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    code: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(v.string()),
    approvalId: v.optional(v.id("approvals")),
    documentId: v.optional(v.id("documents")),
    effectiveDate: v.optional(v.number()),
    reviewDate: v.optional(v.number()),
    currentVersionId: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    const { user } = await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("SOP not found");
    const patch: Record<string, any> = { updatedBy: user._id };
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("sops") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// SOP STEPS
// =============================================================================

export const listSteps = query({
  args: { tenantId: v.string(), sopId: v.id("sops") },
  handler: async (ctx, { tenantId, sopId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("sopSteps")
      .withIndex("by_sopId", (q) => q.eq("tenantId", tenantId).eq("sopId", sopId))
      .collect();
  },
});

export const createStep = mutation({
  args: {
    tenantId: v.string(),
    sopId: v.id("sops"),
    title: v.string(),
    content: v.optional(v.string()),
    stepNumber: v.optional(v.number()),
    parentId: v.optional(v.id("sopSteps")),
    isCritical: v.optional(v.boolean()),
    requiresSignature: v.optional(v.boolean()),
    estimatedDurationMinutes: v.optional(v.number()),
    orderIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("sopSteps", args);
  },
});

export const updateStep = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("sopSteps"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    stepNumber: v.optional(v.number()),
    isCritical: v.optional(v.boolean()),
    requiresSignature: v.optional(v.boolean()),
    estimatedDurationMinutes: v.optional(v.number()),
    orderIndex: v.optional(v.number()),
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

export const removeStep = mutation({
  args: { tenantId: v.string(), id: v.id("sopSteps") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// SOP VERSIONS
// =============================================================================

export const listVersions = query({
  args: { tenantId: v.string(), sopId: v.id("sops") },
  handler: async (ctx, { tenantId, sopId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("sopVersions")
      .withIndex("by_sopId", (q) => q.eq("tenantId", tenantId).eq("sopId", sopId))
      .collect();
  },
});

export const createVersion = mutation({
  args: {
    tenantId: v.string(),
    sopId: v.id("sops"),
    versionNumber: v.optional(v.number()),
    changeSummary: v.optional(v.string()),
    status: v.optional(v.string()),
    stepsSnapshot: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("sopVersions", {
      ...args,
      submittedAt: Date.now(),
      createdBy: user._id,
    });
  },
});

export const updateVersion = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("sopVersions"),
    status: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
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
// SOP EXECUTIONS
// =============================================================================

export const listExecutions = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "sopExecutions", tenantId);
  },
});

export const createExecution = mutation({
  args: {
    tenantId: v.string(),
    sopId: v.id("sops"),
    versionId: v.optional(v.id("sopVersions")),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("sopExecutions", {
      ...args,
      executorId: user._id,
      startedAt: Date.now(),
    });
  },
});

export const updateExecution = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("sopExecutions"),
    status: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    stepCompletions: v.optional(v.any()),
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
// SOP ASSOCIATIONS
// =============================================================================

export const listAssociations = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "sopAssociations", tenantId);
  },
});

export const createAssociation = mutation({
  args: {
    tenantId: v.string(),
    sopId: v.id("sops"),
    associatedEntityType: v.string(),
    associatedEntityId: v.string(),
    inheritToChildren: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("sopAssociations", { ...args, createdBy: user._id });
  },
});

export const removeAssociation = mutation({
  args: { tenantId: v.string(), id: v.id("sopAssociations") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// SOP APPROVAL INSTANCES
// =============================================================================

export const listApprovalInstances = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "sopApprovalInstances", tenantId);
  },
});

export const createApprovalInstance = mutation({
  args: {
    tenantId: v.string(),
    sopVersionId: v.id("sopVersions"),
    approverUserId: v.id("users"),
    sourceApproverId: v.optional(v.id("approvalApprovers")),
    orderIndex: v.optional(v.number()),
    isRequired: v.optional(v.boolean()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("sopApprovalInstances", args);
  },
});

export const updateApprovalInstance = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("sopApprovalInstances"),
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
// SOP APPROVAL DECISIONS
// =============================================================================

export const listApprovalDecisions = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "sopApprovalDecisions", tenantId);
  },
});

export const createApprovalDecision = mutation({
  args: {
    tenantId: v.string(),
    sopVersionId: v.id("sopVersions"),
    approvalId: v.optional(v.id("approvals")),
    approverUserId: v.id("users"),
    decision: v.string(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("sopApprovalDecisions", {
      ...args,
      decidedByUserId: user._id,
    });
  },
});
