/**
 * Temporary seed functions to populate Convex with data from the old
 * Laravel PostgreSQL database. Delete this file after migration.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Generic bulk insert — inserts a batch of rows into any table.
 * Used by the migration script. Accepts raw objects with `_table` removed.
 */
export const bulkInsert = mutation({
  args: {
    table: v.string(),
    rows: v.array(v.any()),
  },
  handler: async (ctx, { table, rows }) => {
    const ids: string[] = [];
    for (const row of rows) {
      const id = await ctx.db.insert(table as any, row);
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Seed a tenant record.
 */
export const seedTenant = mutation({
  args: {
    domain: v.string(),
    name: v.string(),
    database: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tenants")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("tenants", args);
  },
});

/**
 * Seed a userTenantMap entry.
 */
export const seedUserTenantMap = mutation({
  args: {
    firebaseUid: v.string(),
    tenantId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userTenantMap")
      .withIndex("by_firebaseUid", (q) => q.eq("firebaseUid", args.firebaseUid))
      .filter((q) => q.eq(q.field("tenantId"), args.tenantId))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("userTenantMap", args);
  },
});

/**
 * Seed a user record in a tenant.
 */
export const seedUser = mutation({
  args: {
    tenantId: v.string(),
    firebaseUid: v.string(),
    name: v.string(),
    email: v.string(),
    urlPicture: v.optional(v.string()),
    organizationName: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()),
    hasActiveSubscription: v.optional(v.boolean()),
    initializationStage: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_firebaseUid", (q) =>
        q.eq("tenantId", args.tenantId).eq("firebaseUid", args.firebaseUid),
      )
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("users", args);
  },
});

/**
 * Debug: list users for a tenant (no auth required, admin-only use).
 */
export const debugListUsers = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return ctx.db
      .query("users")
      .withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId))
      .collect();
  },
});

/**
 * Debug: list tenants (no auth required, admin-only use).
 */
export const debugListTenants = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("tenants").collect();
  },
});

/**
 * Debug: count tasks for a tenant (no auth required).
 */
export const debugCountTasks = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId))
      .take(3);
    return { count: tasks.length, sample: tasks[0] ?? null };
  },
});

/**
 * Clear all rows from a table for a given tenant (for re-running migration).
 */
export const clearTable = mutation({
  args: {
    table: v.string(),
    tenantId: v.string(),
  },
  handler: async (ctx, { table, tenantId }) => {
    const rows = await ctx.db
      .query(table as any)
      .withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return rows.length;
  },
});
