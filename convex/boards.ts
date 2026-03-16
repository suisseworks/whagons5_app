import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => { await withTenant(ctx, tenantId); return queryByTenant(ctx, "boards", tenantId); },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("boards") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id); if (!doc || doc.tenantId !== tenantId) return null; return doc;
  },
});

export const create = mutation({
  args: { tenantId: v.string(), name: v.string(), description: v.optional(v.string()), visibility: v.optional(v.string()) },
  handler: async (ctx, args) => { const { user } = await withTenant(ctx, args.tenantId); return ctx.db.insert("boards", { ...args, createdBy: user._id }); },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("boards"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    visibility: v.optional(v.string()),
    birthdayMessagesEnabled: v.optional(v.boolean()),
    birthdayMessageTemplate: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, id, ...u }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(u)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("boards") },
  handler: async (ctx, { tenantId, id }) => { await withTenant(ctx, tenantId); const doc = await ctx.db.get(id); if (!doc || doc.tenantId !== tenantId) throw new Error("Not found"); await ctx.db.delete(id); },
});

// --- Board Messages ---
export const listMessages = query({
  args: { tenantId: v.string(), boardId: v.id("boards") },
  handler: async (ctx, { tenantId, boardId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("boardMessages").withIndex("by_boardId", (q) => q.eq("tenantId", tenantId).eq("boardId", boardId)).collect();
  },
});

export const createMessage = mutation({
  args: {
    tenantId: v.string(),
    boardId: v.id("boards"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    isPinned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("boardMessages", { ...args, createdBy: user._id });
  },
});

export const updateMessage = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("boardMessages"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
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
  args: { tenantId: v.string(), id: v.id("boardMessages") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// --- Board Members ---
export const listMembers = query({
  args: { tenantId: v.string(), boardId: v.id("boards") },
  handler: async (ctx, { tenantId, boardId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("boardMembers").withIndex("by_boardId", (q) => q.eq("tenantId", tenantId).eq("boardId", boardId)).collect();
  },
});

export const createMember = mutation({
  args: {
    tenantId: v.string(),
    boardId: v.id("boards"),
    memberType: v.string(),
    memberId: v.string(),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("boardMembers", args);
  },
});

export const removeMember = mutation({
  args: { tenantId: v.string(), id: v.id("boardMembers") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
