import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";
import { getFirebaseUid, getIdentity } from "./_helpers/auth";

/**
 * List all users for a tenant.
 */
export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "users", tenantId);
  },
});

/**
 * Get the current authenticated user for a tenant.
 */
export const me = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const { user } = await withTenant(ctx, tenantId);
    return user;
  },
});

/**
 * Get a user by ID.
 */
export const get = query({
  args: { tenantId: v.string(), id: v.id("users") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const user = await ctx.db.get(id);
    if (!user || user.tenantId !== tenantId) return null;
    return user;
  },
});

/**
 * List all tenants the current Firebase user has access to.
 * Used during login/tenant picker flow (no tenantId required).
 */
export const myTenants = query({
  args: {},
  handler: async (ctx) => {
    const firebaseUid = await getFirebaseUid(ctx);
    const mappings = await ctx.db
      .query("userTenantMap")
      .withIndex("by_firebaseUid", (q) => q.eq("firebaseUid", firebaseUid))
      .collect();
    return mappings.map((m) => m.tenantId);
  },
});

/**
 * Create or update a user in a tenant (used during onboarding/login).
 */
export const upsert = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    email: v.string(),
    urlPicture: v.optional(v.string()),
    organizationName: v.optional(v.string()),
    initializationStage: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const firebaseUid = identity.subject;

    // Check if user already exists in this tenant
    const existing = await ctx.db
      .query("users")
      .withIndex("by_firebaseUid", (q) =>
        q.eq("tenantId", args.tenantId).eq("firebaseUid", firebaseUid),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        urlPicture: args.urlPicture,
        organizationName: args.organizationName,
        initializationStage: args.initializationStage ?? existing.initializationStage,
      });
      return existing._id;
    }

    // Create new user
    const userId = await ctx.db.insert("users", {
      tenantId: args.tenantId,
      firebaseUid,
      name: args.name,
      email: args.email,
      urlPicture: args.urlPicture,
      organizationName: args.organizationName,
      initializationStage: args.initializationStage ?? 0,
    });

    // Ensure tenant mapping exists
    const existingMapping = await ctx.db
      .query("userTenantMap")
      .withIndex("by_firebaseUid", (q) => q.eq("firebaseUid", firebaseUid))
      .filter((q) => q.eq(q.field("tenantId"), args.tenantId))
      .first();

    if (!existingMapping) {
      await ctx.db.insert("userTenantMap", {
        firebaseUid,
        tenantId: args.tenantId,
      });
    }

    return userId;
  },
});

/**
 * Update the current user's profile.
 */
export const updateMe = mutation({
  args: {
    tenantId: v.string(),
    name: v.optional(v.string()),
    urlPicture: v.optional(v.string()),
    color: v.optional(v.string()),
    availabilityStatus: v.optional(v.string()),
    settings: v.optional(v.any()),
  },
  handler: async (ctx, { tenantId, ...updates }) => {
    const { user } = await withTenant(ctx, tenantId);
    // Filter out undefined values
    const patch: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(user._id, patch);
    }
    return user._id;
  },
});
