import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// COST CATEGORIES
// =============================================================================

export const listCategories = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "costCategories", tenantId);
  },
});

export const createCategory = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    type: v.optional(v.string()),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    parentId: v.optional(v.id("costCategories")),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("costCategories", args);
  },
});

export const updateCategory = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("costCategories"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
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

export const removeCategory = mutation({
  args: { tenantId: v.string(), id: v.id("costCategories") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// COST BUDGETS
// =============================================================================

export const listBudgets = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "costBudgets", tenantId);
  },
});

export const createBudget = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    taskId: v.optional(v.id("tasks")),
    estimatedLabor: v.optional(v.number()),
    estimatedMaterials: v.optional(v.number()),
    estimatedOther: v.optional(v.number()),
    estimatedTotal: v.optional(v.number()),
    contingencyPercent: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("costBudgets", args);
  },
});

export const updateBudget = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("costBudgets"),
    name: v.optional(v.string()),
    estimatedLabor: v.optional(v.number()),
    estimatedMaterials: v.optional(v.number()),
    estimatedOther: v.optional(v.number()),
    estimatedTotal: v.optional(v.number()),
    contingencyPercent: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.optional(v.string()),
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

export const removeBudget = mutation({
  args: { tenantId: v.string(), id: v.id("costBudgets") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// COST ITEMS
// =============================================================================

export const listItems = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "costItems", tenantId);
  },
});

export const createItem = mutation({
  args: {
    tenantId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    taskId: v.optional(v.id("tasks")),
    budgetId: v.optional(v.id("costBudgets")),
    costCategoryId: v.optional(v.id("costCategories")),
    type: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    estimatedAmount: v.optional(v.number()),
    actualAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    workerUserId: v.optional(v.id("users")),
    hourlyRate: v.optional(v.number()),
    hoursWorked: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    overtimeRate: v.optional(v.number()),
    workDate: v.optional(v.number()),
    materialName: v.optional(v.string()),
    unit: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    quantityEstimated: v.optional(v.number()),
    quantityActual: v.optional(v.number()),
    supplierName: v.optional(v.string()),
    date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("costItems", args);
  },
});

export const updateItem = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("costItems"),
    type: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    estimatedAmount: v.optional(v.number()),
    actualAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    hoursWorked: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    quantityActual: v.optional(v.number()),
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

export const removeItem = mutation({
  args: { tenantId: v.string(), id: v.id("costItems") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
