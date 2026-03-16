import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// WORKSPACE RESOURCES (files/documents attached to workspaces)
// =============================================================================

export const list = query({
  args: { tenantId: v.string(), workspaceId: v.id("workspaces") },
  handler: async (ctx, { tenantId, workspaceId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("workspaceResources")
      .withIndex("by_workspaceId", (q) => q.eq("tenantId", tenantId).eq("workspaceId", workspaceId))
      .collect();
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(),
    workspaceId: v.id("workspaces"),
    uuid: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    filePath: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileExtension: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    folder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("workspaceResources", { ...args, userId: user._id });
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("workspaceResources") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// MESSAGES (workspace-level announcements)
// =============================================================================

export const listMessages = query({
  args: { tenantId: v.string(), workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, { tenantId, workspaceId }) => {
    await withTenant(ctx, tenantId);
    if (workspaceId) {
      return ctx.db
        .query("messages")
        .withIndex("by_workspaceId", (q) => q.eq("tenantId", tenantId).eq("workspaceId", workspaceId))
        .collect();
    }
    return queryByTenant(ctx, "messages", tenantId);
  },
});

export const createMessage = mutation({
  args: {
    tenantId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    teamId: v.optional(v.id("teams")),
    spotId: v.optional(v.id("spots")),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    isPinned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("messages", { ...args, createdBy: user._id });
  },
});

export const updateMessage = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("messages"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    isPinned: v.optional(v.boolean()),
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

export const removeMessage = mutation({
  args: { tenantId: v.string(), id: v.id("messages") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// LINK PREVIEWS
// =============================================================================

export const listLinkPreviews = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "linkPreviews", tenantId);
  },
});

export const createLinkPreview = mutation({
  args: {
    tenantId: v.string(),
    messageId: v.optional(v.string()),
    workspaceChatId: v.optional(v.string()),
    urlHash: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    siteName: v.optional(v.string()),
    faviconUrl: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("linkPreviews", args);
  },
});

// =============================================================================
// BOARD ATTACHMENTS
// =============================================================================

export const listBoardAttachments = query({
  args: { tenantId: v.string(), boardMessageId: v.id("boardMessages") },
  handler: async (ctx, { tenantId, boardMessageId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("boardAttachments")
      .withIndex("by_boardMessageId", (q) =>
        q.eq("tenantId", tenantId).eq("boardMessageId", boardMessageId),
      )
      .collect();
  },
});

export const listBoardAttachmentsByBoard = query({
  args: { tenantId: v.string(), boardId: v.id("boards") },
  handler: async (ctx, { tenantId, boardId }) => {
    await withTenant(ctx, tenantId);
    // Get all messages for this board, then gather all their attachments
    const messages = await ctx.db
      .query("boardMessages")
      .withIndex("by_boardId", (q) => q.eq("tenantId", tenantId).eq("boardId", boardId))
      .collect();
    const allAttachments = [];
    for (const msg of messages) {
      const attachments = await ctx.db
        .query("boardAttachments")
        .withIndex("by_boardMessageId", (q) =>
          q.eq("tenantId", tenantId).eq("boardMessageId", msg._id),
        )
        .collect();
      allAttachments.push(...attachments);
    }
    return allAttachments;
  },
});

export const createBoardAttachment = mutation({
  args: {
    tenantId: v.string(),
    boardMessageId: v.id("boardMessages"),
    uuid: v.optional(v.string()),
    type: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    filePath: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileExtension: v.optional(v.string()),
    fileSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("boardAttachments", { ...args, userId: user._id });
  },
});

export const removeBoardAttachment = mutation({
  args: { tenantId: v.string(), id: v.id("boardAttachments") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// BOARD BIRTHDAY IMAGES
// =============================================================================

export const listBoardBirthdayImages = query({
  args: { tenantId: v.string(), boardId: v.id("boards") },
  handler: async (ctx, { tenantId, boardId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("boardBirthdayImages")
      .withIndex("by_boardId", (q) => q.eq("tenantId", tenantId).eq("boardId", boardId))
      .collect();
  },
});

export const createBoardBirthdayImage = mutation({
  args: {
    tenantId: v.string(),
    boardId: v.id("boards"),
    storageId: v.optional(v.id("_storage")),
    filePath: v.optional(v.string()),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("boardBirthdayImages", { ...args, uploadedBy: user._id });
  },
});

export const removeBoardBirthdayImage = mutation({
  args: { tenantId: v.string(), id: v.id("boardBirthdayImages") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// PLUGIN ROUTES
// =============================================================================

export const listPluginRoutes = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "pluginRoutes", tenantId);
  },
});

export const createPluginRoute = mutation({
  args: {
    tenantId: v.string(),
    pluginId: v.id("plugins"),
    method: v.optional(v.string()),
    path: v.optional(v.string()),
    controller: v.optional(v.string()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("pluginRoutes", args);
  },
});

export const removePluginRoute = mutation({
  args: { tenantId: v.string(), id: v.id("pluginRoutes") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// TEMPLATE CUSTOM FIELDS
// =============================================================================

export const listTemplateCustomFields = query({
  args: { tenantId: v.string(), templateId: v.id("templates") },
  handler: async (ctx, { tenantId, templateId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("templateCustomFields")
      .withIndex("by_templateId", (q) => q.eq("tenantId", tenantId).eq("templateId", templateId))
      .collect();
  },
});

export const assignTemplateCustomField = mutation({
  args: {
    tenantId: v.string(),
    fieldId: v.id("customFields"),
    templateId: v.id("templates"),
    isRequired: v.optional(v.boolean()),
    order: v.optional(v.number()),
    defaultValue: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("templateCustomFields", args);
  },
});

export const removeTemplateCustomField = mutation({
  args: { tenantId: v.string(), id: v.id("templateCustomFields") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// SPOT CUSTOM FIELDS
// =============================================================================

export const listSpotCustomFields = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "spotCustomFields", tenantId);
  },
});

export const createSpotCustomField = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    fieldType: v.string(),
    options: v.optional(v.any()),
    validationRules: v.optional(v.any()),
    spotTypeId: v.optional(v.id("spotTypes")),
    isRequired: v.optional(v.boolean()),
    defaultValue: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("spotCustomFields", args);
  },
});

export const removeSpotCustomField = mutation({
  args: { tenantId: v.string(), id: v.id("spotCustomFields") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// SPOT CUSTOM FIELD VALUES
// =============================================================================

export const listSpotCustomFieldValues = query({
  args: { tenantId: v.string(), spotId: v.id("spots") },
  handler: async (ctx, { tenantId, spotId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("spotCustomFieldValues")
      .withIndex("by_spotId", (q) => q.eq("tenantId", tenantId).eq("spotId", spotId))
      .collect();
  },
});

export const setSpotCustomFieldValue = mutation({
  args: {
    tenantId: v.string(),
    spotId: v.id("spots"),
    fieldId: v.id("spotCustomFields"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    value: v.optional(v.any()),
    valueNumeric: v.optional(v.number()),
    valueDate: v.optional(v.number()),
    valueJson: v.optional(v.any()),
  },
  handler: async (ctx, { tenantId, spotId, fieldId, ...rest }) => {
    await withTenant(ctx, tenantId);
    // Upsert
    const existing = await ctx.db
      .query("spotCustomFieldValues")
      .withIndex("by_spotId", (q) => q.eq("tenantId", tenantId).eq("spotId", spotId))
      .filter((q) => q.eq(q.field("fieldId"), fieldId))
      .first();
    if (existing) {
      const patch: Record<string, any> = {};
      for (const [k, val] of Object.entries(rest)) if (val !== undefined) patch[k] = val;
      if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert("spotCustomFieldValues", { tenantId, spotId, fieldId, ...rest });
  },
});
