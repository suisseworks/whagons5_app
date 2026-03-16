import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// COMPLIANCE STANDARDS
// =============================================================================

export const listStandards = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "complianceStandards", tenantId);
  },
});

export const getStandard = query({
  args: { tenantId: v.string(), id: v.id("complianceStandards") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) return null;
    return doc;
  },
});

export const createStandard = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    code: v.optional(v.string()),
    version: v.optional(v.string()),
    description: v.optional(v.string()),
    authority: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("complianceStandards", { ...args, createdBy: user._id });
  },
});

export const updateStandard = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("complianceStandards"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    version: v.optional(v.string()),
    description: v.optional(v.string()),
    authority: v.optional(v.string()),
    active: v.optional(v.boolean()),
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

export const removeStandard = mutation({
  args: { tenantId: v.string(), id: v.id("complianceStandards") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// COMPLIANCE REQUIREMENTS
// =============================================================================

export const listRequirements = query({
  args: { tenantId: v.string(), standardId: v.id("complianceStandards") },
  handler: async (ctx, { tenantId, standardId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("complianceRequirements")
      .withIndex("by_standardId", (q) => q.eq("tenantId", tenantId).eq("standardId", standardId))
      .collect();
  },
});

export const createRequirement = mutation({
  args: {
    tenantId: v.string(),
    standardId: v.id("complianceStandards"),
    title: v.string(),
    clauseNumber: v.optional(v.string()),
    description: v.optional(v.string()),
    implementationGuidance: v.optional(v.string()),
    mandatory: v.optional(v.boolean()),
    parentId: v.optional(v.id("complianceRequirements")),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("complianceRequirements", args);
  },
});

export const updateRequirement = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("complianceRequirements"),
    title: v.optional(v.string()),
    clauseNumber: v.optional(v.string()),
    description: v.optional(v.string()),
    implementationGuidance: v.optional(v.string()),
    mandatory: v.optional(v.boolean()),
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

export const removeRequirement = mutation({
  args: { tenantId: v.string(), id: v.id("complianceRequirements") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// COMPLIANCE MAPPINGS
// =============================================================================

export const listMappings = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "complianceMappings", tenantId);
  },
});

export const createMapping = mutation({
  args: {
    tenantId: v.string(),
    requirementId: v.id("complianceRequirements"),
    mappedEntityType: v.string(),
    mappedEntityId: v.string(),
    justification: v.optional(v.string()),
    complianceStatus: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("complianceMappings", { ...args, createdBy: user._id });
  },
});

export const updateMapping = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("complianceMappings"),
    justification: v.optional(v.string()),
    complianceStatus: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    const { user } = await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    const patch: Record<string, any> = { reviewedBy: user._id, reviewedAt: Date.now() };
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    await ctx.db.patch(id, patch);
    return id;
  },
});

export const removeMapping = mutation({
  args: { tenantId: v.string(), id: v.id("complianceMappings") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// COMPLIANCE AUDITS
// =============================================================================

export const listAudits = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "complianceAudits", tenantId);
  },
});

export const createAudit = mutation({
  args: {
    tenantId: v.string(),
    standardId: v.id("complianceStandards"),
    name: v.string(),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    scheduledStartDate: v.optional(v.number()),
    scheduledEndDate: v.optional(v.number()),
    auditorId: v.optional(v.id("users")),
    externalAuditorName: v.optional(v.string()),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("complianceAudits", { ...args, createdBy: user._id });
  },
});

export const updateAudit = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("complianceAudits"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    scheduledStartDate: v.optional(v.number()),
    scheduledEndDate: v.optional(v.number()),
    actualStartDate: v.optional(v.number()),
    completedDate: v.optional(v.number()),
    auditorId: v.optional(v.id("users")),
    externalAuditorName: v.optional(v.string()),
    scope: v.optional(v.string()),
    summaryFindings: v.optional(v.string()),
    score: v.optional(v.number()),
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

export const removeAudit = mutation({
  args: { tenantId: v.string(), id: v.id("complianceAudits") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
