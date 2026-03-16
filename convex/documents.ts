import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// DOCUMENT CATEGORIES
// =============================================================================

export const listCategories = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "documentCategories", tenantId);
  },
});

export const createCategory = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    position: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("documentCategories", { ...args, createdBy: user._id });
  },
});

export const updateCategory = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("documentCategories"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    position: v.optional(v.number()),
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
  args: { tenantId: v.string(), id: v.id("documentCategories") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// DOCUMENTS
// =============================================================================

export const list = query({
  args: {
    tenantId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, { tenantId, workspaceId }) => {
    await withTenant(ctx, tenantId);
    if (workspaceId) {
      return ctx.db
        .query("documents")
        .withIndex("by_workspaceId", (q) => q.eq("tenantId", tenantId).eq("workspaceId", workspaceId))
        .collect();
    }
    return queryByTenant(ctx, "documents", tenantId);
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("documents") },
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
    documentType: v.optional(v.string()),
    documentCategoryId: v.optional(v.id("documentCategories")),
    workspaceId: v.optional(v.id("workspaces")),
    storageId: v.optional(v.id("_storage")),
    filePath: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileExtension: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    version: v.optional(v.number()),
    isPublic: v.optional(v.boolean()),
    requiresAcknowledgment: v.optional(v.boolean()),
    uuid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("documents", { ...args, createdBy: user._id });
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("documents"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    documentType: v.optional(v.string()),
    documentCategoryId: v.optional(v.id("documentCategories")),
    isPublic: v.optional(v.boolean()),
    requiresAcknowledgment: v.optional(v.boolean()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Document not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("documents") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// DOCUMENT ASSOCIATIONS
// =============================================================================

export const listAssociations = query({
  args: { tenantId: v.string(), documentId: v.id("documents") },
  handler: async (ctx, { tenantId, documentId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("documentAssociations")
      .withIndex("by_documentId", (q) => q.eq("tenantId", tenantId).eq("documentId", documentId))
      .collect();
  },
});

export const createAssociation = mutation({
  args: {
    tenantId: v.string(),
    documentId: v.id("documents"),
    associableType: v.string(),
    associableId: v.string(),
    inheritToChildren: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("documentAssociations", args);
  },
});

export const removeAssociation = mutation({
  args: { tenantId: v.string(), id: v.id("documentAssociations") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// DOCUMENT ACKNOWLEDGMENTS
// =============================================================================

export const listAcknowledgments = query({
  args: { tenantId: v.string(), documentId: v.id("documents") },
  handler: async (ctx, { tenantId, documentId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("documentAcknowledgments")
      .withIndex("by_documentId", (q) => q.eq("tenantId", tenantId).eq("documentId", documentId))
      .collect();
  },
});

export const acknowledge = mutation({
  args: {
    tenantId: v.string(),
    documentId: v.id("documents"),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, documentId, ipAddress }) => {
    const { user } = await withTenant(ctx, tenantId);
    // Prevent duplicate acknowledgments
    const existing = await ctx.db
      .query("documentAcknowledgments")
      .withIndex("by_documentId", (q) => q.eq("tenantId", tenantId).eq("documentId", documentId))
      .filter((q) => q.eq(q.field("userId"), user._id))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("documentAcknowledgments", {
      tenantId,
      documentId,
      userId: user._id,
      acknowledgedAt: Date.now(),
      ipAddress,
    });
  },
});
