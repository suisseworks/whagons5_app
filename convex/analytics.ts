import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// KPI CARDS
// =============================================================================

export const listKpiCards = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "kpiCards", tenantId);
  },
});

export const createKpiCard = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    type: v.optional(v.string()),
    queryConfig: v.optional(v.any()),
    displayConfig: v.optional(v.any()),
    position: v.optional(v.number()),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("kpiCards", args);
  },
});

export const updateKpiCard = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("kpiCards"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    queryConfig: v.optional(v.any()),
    displayConfig: v.optional(v.any()),
    position: v.optional(v.number()),
    isEnabled: v.optional(v.boolean()),
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

export const removeKpiCard = mutation({
  args: { tenantId: v.string(), id: v.id("kpiCards") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// REPORTS
// =============================================================================

export const listReports = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "reports", tenantId);
  },
});

export const createReport = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    type: v.optional(v.string()),
    visibility: v.optional(v.string()),
    config: v.optional(v.any()),
    filters: v.optional(v.any()),
    isTemplate: v.optional(v.boolean()),
    isPinned: v.optional(v.boolean()),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("reports", args);
  },
});

export const updateReport = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("reports"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    visibility: v.optional(v.string()),
    config: v.optional(v.any()),
    filters: v.optional(v.any()),
    isTemplate: v.optional(v.boolean()),
    isPinned: v.optional(v.boolean()),
    position: v.optional(v.number()),
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

export const removeReport = mutation({
  args: { tenantId: v.string(), id: v.id("reports") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// REPORT SCHEDULES
// =============================================================================

export const listReportSchedules = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "reportSchedules", tenantId);
  },
});

export const createReportSchedule = mutation({
  args: {
    tenantId: v.string(),
    reportId: v.id("reports"),
    frequency: v.optional(v.string()),
    sendAt: v.optional(v.string()),
    recipients: v.optional(v.any()),
    format: v.optional(v.string()),
    includeAiSummary: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("reportSchedules", args);
  },
});

export const removeReportSchedule = mutation({
  args: { tenantId: v.string(), id: v.id("reportSchedules") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// REPORT SNAPSHOTS
// =============================================================================

export const listReportSnapshots = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "reportSnapshots", tenantId);
  },
});

export const createReportSnapshot = mutation({
  args: {
    tenantId: v.string(),
    reportId: v.id("reports"),
    fileFormat: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("reportSnapshots", { ...args, generatedBy: user._id });
  },
});

// =============================================================================
// SESSION LOGS
// =============================================================================

export const listSessionLogs = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "sessionLogs", tenantId);
  },
});

export const createSessionLog = mutation({
  args: {
    tenantId: v.string(),
    actionType: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    description: v.optional(v.string()),
    deviceData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("sessionLogs", { ...args, userId: user._id });
  },
});

// =============================================================================
// CONFIG LOGS
// =============================================================================

export const listConfigLogs = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "configLogs", tenantId);
  },
});

export const createConfigLog = mutation({
  args: {
    tenantId: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    action: v.optional(v.string()),
    oldValues: v.optional(v.any()),
    newValues: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("configLogs", args);
  },
});
