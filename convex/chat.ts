import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// --- Conversations ---
export const listConversations = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => { await withTenant(ctx, tenantId); return queryByTenant(ctx, "conversations", tenantId); },
});

export const createConversation = mutation({
  args: { tenantId: v.string(), type: v.optional(v.string()), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("conversations", { ...args, createdBy: user._id, lastMessageAt: Date.now() });
  },
});

/** Bulk: all participants for the tenant. */
export const listAllParticipants = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => { await withTenant(ctx, tenantId); return queryByTenant(ctx, "conversationParticipants", tenantId); },
});

/** Bulk: all direct messages for the tenant. */
export const listAllMessages = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => { await withTenant(ctx, tenantId); return queryByTenant(ctx, "directMessages", tenantId); },
});

/** Bulk: all reactions for the tenant. */
export const listAllReactions = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => { await withTenant(ctx, tenantId); return queryByTenant(ctx, "messageReactions", tenantId); },
});

/** Bulk: all link previews for the tenant. */
export const listAllLinkPreviews = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => { await withTenant(ctx, tenantId); return queryByTenant(ctx, "linkPreviews", tenantId); },
});

// --- Mark as read ---
export const markAsRead = mutation({
  args: { tenantId: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, { tenantId, conversationId }) => {
    const { user } = await withTenant(ctx, tenantId);
    const participants = await ctx.db
      .query("conversationParticipants")
      .withIndex("by_conversationId", (q) =>
        q.eq("tenantId", tenantId).eq("conversationId", conversationId)
      )
      .collect();
    const mine = participants.find((p) => p.userId === user._id);
    if (mine) {
      await ctx.db.patch(mine._id, { lastReadAt: Date.now() });
    }
  },
});

// --- Conversation Participants ---
export const listParticipants = query({
  args: { tenantId: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, { tenantId, conversationId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("conversationParticipants").withIndex("by_conversationId", (q) => q.eq("tenantId", tenantId).eq("conversationId", conversationId)).collect();
  },
});

export const addParticipant = mutation({
  args: { tenantId: v.string(), conversationId: v.id("conversations"), userId: v.id("users") },
  handler: async (ctx, args) => { await withTenant(ctx, args.tenantId); return ctx.db.insert("conversationParticipants", args); },
});

// --- Direct Messages ---
export const listMessages = query({
  args: { tenantId: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, { tenantId, conversationId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("directMessages").withIndex("by_conversationId", (q) => q.eq("tenantId", tenantId).eq("conversationId", conversationId)).collect();
  },
});

export const sendMessage = mutation({
  args: { tenantId: v.string(), conversationId: v.id("conversations"), message: v.string() },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    const msgId = await ctx.db.insert("directMessages", { ...args, userId: user._id });
    await ctx.db.patch(args.conversationId, { lastMessageAt: Date.now() });
    return msgId;
  },
});

// --- Workspace Chat ---
export const listWorkspaceChat = query({
  args: { tenantId: v.string(), workspaceId: v.id("workspaces") },
  handler: async (ctx, { tenantId, workspaceId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("workspaceChat").withIndex("by_workspaceId", (q) => q.eq("tenantId", tenantId).eq("workspaceId", workspaceId)).collect();
  },
});

export const sendWorkspaceChat = mutation({
  args: { tenantId: v.string(), workspaceId: v.id("workspaces"), message: v.string() },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("workspaceChat", { ...args, userId: user._id });
  },
});

// --- Update / Delete Messages ---
export const updateMessage = mutation({
  args: { tenantId: v.string(), id: v.id("directMessages"), message: v.string() },
  handler: async (ctx, { tenantId, id, message }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.patch(id, { message });
  },
});

export const deleteMessage = mutation({
  args: { tenantId: v.string(), id: v.id("directMessages") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

export const updateWorkspaceChatMessage = mutation({
  args: { tenantId: v.string(), id: v.id("workspaceChat"), message: v.string() },
  handler: async (ctx, { tenantId, id, message }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.patch(id, { message });
  },
});

export const deleteWorkspaceChatMessage = mutation({
  args: { tenantId: v.string(), id: v.id("workspaceChat") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// --- Message Reactions ---
export const addReaction = mutation({
  args: { tenantId: v.string(), messageId: v.string(), emoji: v.string() },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("messageReactions", { ...args, userId: user._id });
  },
});

export const removeReaction = mutation({
  args: { tenantId: v.string(), id: v.id("messageReactions") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// --- Conversation management ---
export const updateConversation = mutation({
  args: { tenantId: v.string(), id: v.id("conversations"), name: v.optional(v.string()) },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.patch(id, updates);
  },
});

export const removeParticipant = mutation({
  args: { tenantId: v.string(), id: v.id("conversationParticipants") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// --- File upload helpers ---
export const generateUploadUrl = mutation({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return ctx.storage.getUrl(storageId);
  },
});
