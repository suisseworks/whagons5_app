import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// --- Global Settings ---
export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => { await withTenant(ctx, tenantId); return queryByTenant(ctx, "globalSettings", tenantId); },
});

export const getByKey = query({
  args: { tenantId: v.string(), key: v.string() },
  handler: async (ctx, { tenantId, key }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("globalSettings").withIndex("by_key", (q) => q.eq("tenantId", tenantId).eq("key", key)).first();
  },
});

export const set = mutation({
  args: { tenantId: v.string(), key: v.string(), value: v.any(), group: v.optional(v.string()) },
  handler: async (ctx, { tenantId, key, value, group }) => {
    await withTenant(ctx, tenantId);
    const existing = await ctx.db.query("globalSettings").withIndex("by_key", (q) => q.eq("tenantId", tenantId).eq("key", key)).first();
    if (existing) { await ctx.db.patch(existing._id, { value, group }); return existing._id; }
    return ctx.db.insert("globalSettings", { tenantId, key, value, group });
  },
});

// --- Plugins ---
export const listPlugins = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => { await withTenant(ctx, tenantId); return queryByTenant(ctx, "plugins", tenantId); },
});

export const getPlugin = query({
  args: { tenantId: v.string(), slug: v.string() },
  handler: async (ctx, { tenantId, slug }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("plugins").withIndex("by_slug", (q) => q.eq("tenantId", tenantId).eq("slug", slug)).first();
  },
});

export const togglePlugin = mutation({
  args: { tenantId: v.string(), id: v.id("plugins"), isEnabled: v.boolean() },
  handler: async (ctx, { tenantId, id, isEnabled }) => {
    await withTenant(ctx, tenantId); const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.patch(id, { isEnabled }); return id;
  },
});

// --- Job Positions ---
export const listJobPositions = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => { await withTenant(ctx, tenantId); return queryByTenant(ctx, "jobPositions", tenantId); },
});

export const createJobPosition = mutation({
  args: { tenantId: v.string(), title: v.string(), code: v.optional(v.string()), level: v.optional(v.number()), isLeadership: v.optional(v.boolean()), isActive: v.optional(v.boolean()), description: v.optional(v.string()) },
  handler: async (ctx, args) => { await withTenant(ctx, args.tenantId); return ctx.db.insert("jobPositions", args); },
});

// --- Translations ---
export const listTranslations = query({
  args: { tenantId: v.string(), entityType: v.optional(v.string()), entityId: v.optional(v.string()) },
  handler: async (ctx, { tenantId, entityType, entityId }) => {
    await withTenant(ctx, tenantId);
    if (entityType && entityId) {
      return ctx.db.query("translations").withIndex("by_entity", (q) => q.eq("tenantId", tenantId).eq("entityType", entityType).eq("entityId", entityId)).collect();
    }
    return queryByTenant(ctx, "translations", tenantId);
  },
});

// --- Notifications ---
export const listNotifications = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const { user } = await withTenant(ctx, tenantId);
    return ctx.db.query("notifications").withIndex("by_userId", (q) => q.eq("tenantId", tenantId).eq("userId", user._id)).collect();
  },
});

export const markRead = mutation({
  args: { tenantId: v.string(), id: v.id("notifications") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId); const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.patch(id, { readAt: Date.now() }); return id;
  },
});

export const markAllRead = mutation({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const { user } = await withTenant(ctx, tenantId);
    const unread = await ctx.db.query("notifications").withIndex("by_userId", (q) => q.eq("tenantId", tenantId).eq("userId", user._id)).filter((q) => q.eq(q.field("readAt"), undefined)).collect();
    const now = Date.now();
    for (const n of unread) await ctx.db.patch(n._id, { readAt: now });
    return unread.length;
  },
});
