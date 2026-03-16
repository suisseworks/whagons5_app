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
    await withTenant(ctx, tenantId); const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
