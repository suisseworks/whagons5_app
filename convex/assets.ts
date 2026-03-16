import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// ASSET TYPES
// =============================================================================

export const listTypes = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "assetTypes", tenantId);
  },
});

export const createType = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("assetTypes", args);
  },
});

export const updateType = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("assetTypes"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
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
  args: { tenantId: v.string(), id: v.id("assetTypes") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// ASSET ITEMS
// =============================================================================

export const list = query({
  args: {
    tenantId: v.string(),
    spotId: v.optional(v.id("spots")),
  },
  handler: async (ctx, { tenantId, spotId }) => {
    await withTenant(ctx, tenantId);
    if (spotId) {
      return ctx.db
        .query("assetItems")
        .withIndex("by_spotId", (q) => q.eq("tenantId", tenantId).eq("spotId", spotId))
        .collect();
    }
    return queryByTenant(ctx, "assetItems", tenantId);
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("assetItems") },
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
    name: v.string(),
    parentId: v.optional(v.id("assetItems")),
    assetTypeId: v.optional(v.id("assetTypes")),
    spotId: v.optional(v.id("spots")),
    serialNumber: v.optional(v.string()),
    model: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    purchaseDate: v.optional(v.number()),
    purchaseCost: v.optional(v.number()),
    warrantyExpiration: v.optional(v.number()),
    status: v.optional(v.string()),
    qrCode: v.optional(v.string()),
    notes: v.optional(v.string()),
    assignedUserId: v.optional(v.id("users")),
    assignedTeamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("assetItems", args);
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("assetItems"),
    name: v.optional(v.string()),
    parentId: v.optional(v.id("assetItems")),
    assetTypeId: v.optional(v.id("assetTypes")),
    spotId: v.optional(v.id("spots")),
    serialNumber: v.optional(v.string()),
    model: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    purchaseDate: v.optional(v.number()),
    purchaseCost: v.optional(v.number()),
    warrantyExpiration: v.optional(v.number()),
    status: v.optional(v.string()),
    qrCode: v.optional(v.string()),
    notes: v.optional(v.string()),
    assignedUserId: v.optional(v.id("users")),
    assignedTeamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Asset not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("assetItems") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// ASSET MAINTENANCE SCHEDULES
// =============================================================================

export const listMaintenanceSchedules = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "assetMaintenanceSchedules", tenantId);
  },
});

export const createMaintenanceSchedule = mutation({
  args: {
    tenantId: v.string(),
    assetItemId: v.id("assetItems"),
    title: v.string(),
    description: v.optional(v.string()),
    frequencyValue: v.optional(v.number()),
    frequencyUnit: v.optional(v.string()),
    nextDueDate: v.optional(v.number()),
    workspaceId: v.optional(v.id("workspaces")),
    categoryId: v.optional(v.id("categories")),
    assignedTeamId: v.optional(v.id("teams")),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("assetMaintenanceSchedules", args);
  },
});

export const updateMaintenanceSchedule = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("assetMaintenanceSchedules"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    frequencyValue: v.optional(v.number()),
    frequencyUnit: v.optional(v.string()),
    nextDueDate: v.optional(v.number()),
    lastPerformedAt: v.optional(v.number()),
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

export const removeMaintenanceSchedule = mutation({
  args: { tenantId: v.string(), id: v.id("assetMaintenanceSchedules") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// ASSET MAINTENANCE LOGS
// =============================================================================

export const listMaintenanceLogs = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "assetMaintenanceLogs", tenantId);
  },
});

export const createMaintenanceLog = mutation({
  args: {
    tenantId: v.string(),
    assetItemId: v.id("assetItems"),
    scheduleId: v.optional(v.id("assetMaintenanceSchedules")),
    taskId: v.optional(v.id("tasks")),
    performedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    cost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("assetMaintenanceLogs", {
      ...args,
      performedBy: user._id,
      performedAt: args.performedAt ?? Date.now(),
    });
  },
});

// =============================================================================
// ASSET CUSTOM FIELDS
// =============================================================================

export const listCustomFields = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "assetCustomFields", tenantId);
  },
});

export const createCustomField = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    fieldType: v.string(),
    options: v.optional(v.any()),
    validationRules: v.optional(v.any()),
    assetTypeId: v.optional(v.id("assetTypes")),
    isRequired: v.optional(v.boolean()),
    defaultValue: v.optional(v.any()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("assetCustomFields", args);
  },
});

export const updateCustomField = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("assetCustomFields"),
    name: v.optional(v.string()),
    fieldType: v.optional(v.string()),
    options: v.optional(v.any()),
    validationRules: v.optional(v.any()),
    isRequired: v.optional(v.boolean()),
    defaultValue: v.optional(v.any()),
    sortOrder: v.optional(v.number()),
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

export const removeCustomField = mutation({
  args: { tenantId: v.string(), id: v.id("assetCustomFields") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// ASSET CUSTOM FIELD VALUES
// =============================================================================

export const listCustomFieldValues = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "assetCustomFieldValues", tenantId);
  },
});

export const setCustomFieldValue = mutation({
  args: {
    tenantId: v.string(),
    assetItemId: v.id("assetItems"),
    fieldId: v.id("assetCustomFields"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    value: v.optional(v.any()),
    valueNumeric: v.optional(v.number()),
    valueDate: v.optional(v.number()),
    valueJson: v.optional(v.any()),
  },
  handler: async (ctx, { tenantId, assetItemId, fieldId, ...rest }) => {
    await withTenant(ctx, tenantId);
    // Upsert pattern
    const existing = await ctx.db
      .query("assetCustomFieldValues")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .filter((q) =>
        q.and(
          q.eq(q.field("assetItemId"), assetItemId),
          q.eq(q.field("fieldId"), fieldId),
        ),
      )
      .first();
    if (existing) {
      const patch: Record<string, any> = {};
      for (const [k, val] of Object.entries(rest)) if (val !== undefined) patch[k] = val;
      if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert("assetCustomFieldValues", {
      tenantId,
      assetItemId,
      fieldId,
      ...rest,
    });
  },
});
