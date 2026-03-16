import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// FORMS
// =============================================================================

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "forms", tenantId);
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("forms") },
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
    description: v.optional(v.string()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("forms", { ...args, createdBy: user._id });
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("forms"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    currentVersionId: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Form not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("forms") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Form not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// FORM FIELDS
// =============================================================================

export const listFields = query({
  args: { tenantId: v.string(), formId: v.id("forms") },
  handler: async (ctx, { tenantId, formId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("formFields")
      .withIndex("by_formId", (q) => q.eq("tenantId", tenantId).eq("formId", formId))
      .collect();
  },
});

export const createField = mutation({
  args: {
    tenantId: v.string(),
    formId: v.id("forms"),
    name: v.string(),
    type: v.string(),
    position: v.optional(v.number()),
    properties: v.optional(v.any()),
    isRequired: v.optional(v.boolean()),
    validationRules: v.optional(v.any()),
    displayRules: v.optional(v.any()),
    optionVersionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("formFields", args);
  },
});

export const updateField = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("formFields"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    position: v.optional(v.number()),
    properties: v.optional(v.any()),
    isRequired: v.optional(v.boolean()),
    validationRules: v.optional(v.any()),
    displayRules: v.optional(v.any()),
    optionVersionId: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Field not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const removeField = mutation({
  args: { tenantId: v.string(), id: v.id("formFields") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// FORM VERSIONS
// =============================================================================

export const listVersions = query({
  args: { tenantId: v.string(), formId: v.id("forms") },
  handler: async (ctx, { tenantId, formId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("formVersions")
      .withIndex("by_formId", (q) => q.eq("tenantId", tenantId).eq("formId", formId))
      .collect();
  },
});

export const createVersion = mutation({
  args: {
    tenantId: v.string(),
    formId: v.id("forms"),
    version: v.number(),
    fields: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("formVersions", args);
  },
});

// =============================================================================
// TASK FORMS (form submissions on tasks)
// =============================================================================

export const listTaskForms = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("taskForms")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .collect();
  },
});

export const submitTaskForm = mutation({
  args: {
    tenantId: v.string(),
    taskId: v.id("tasks"),
    formVersionId: v.id("formVersions"),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("taskForms", args);
  },
});

export const updateTaskForm = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("taskForms"),
    data: v.optional(v.any()),
  },
  handler: async (ctx, { tenantId, id, data }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.patch(id, { data });
    return id;
  },
});

// =============================================================================
// FIELD OPTIONS
// =============================================================================

export const listFieldOptions = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "fieldOptions", tenantId);
  },
});

export const createFieldOption = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    version: v.optional(v.number()),
    data: v.optional(v.any()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("fieldOptions", { ...args, createdBy: user._id });
  },
});

export const updateFieldOption = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("fieldOptions"),
    name: v.optional(v.string()),
    version: v.optional(v.number()),
    data: v.optional(v.any()),
    enabled: v.optional(v.boolean()),
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

export const removeFieldOption = mutation({
  args: { tenantId: v.string(), id: v.id("fieldOptions") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
