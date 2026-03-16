import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// TENANTS
// =============================================================================

export const getByDomain = query({
  args: { domain: v.string() },
  handler: async (ctx, { domain }) => {
    return ctx.db
      .query("tenants")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .first();
  },
});

export const create = mutation({
  args: {
    domain: v.string(),
    name: v.string(),
    database: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check uniqueness
    const existing = await ctx.db
      .query("tenants")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .first();
    if (existing) throw new Error("Domain already taken");
    return ctx.db.insert("tenants", args);
  },
});

// =============================================================================
// USER TEAMS
// =============================================================================

export const listUserTeams = query({
  args: { tenantId: v.string(), userId: v.optional(v.id("users")) },
  handler: async (ctx, { tenantId, userId }) => {
    await withTenant(ctx, tenantId);
    if (userId) {
      return ctx.db
        .query("userTeams")
        .withIndex("by_userId", (q) => q.eq("tenantId", tenantId).eq("userId", userId))
        .collect();
    }
    return queryByTenant(ctx, "userTeams", tenantId);
  },
});

export const listTeamUsers = query({
  args: { tenantId: v.string(), teamId: v.id("teams") },
  handler: async (ctx, { tenantId, teamId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db
      .query("userTeams")
      .withIndex("by_teamId", (q) => q.eq("tenantId", tenantId).eq("teamId", teamId))
      .collect();
  },
});

export const assignUserToTeam = mutation({
  args: {
    tenantId: v.string(),
    userId: v.id("users"),
    teamId: v.id("teams"),
    roleId: v.optional(v.id("roles")),
  },
  handler: async (ctx, { tenantId, userId, teamId, roleId }) => {
    await withTenant(ctx, tenantId);
    // Prevent duplicate
    const existing = await ctx.db
      .query("userTeams")
      .withIndex("by_userId", (q) => q.eq("tenantId", tenantId).eq("userId", userId))
      .filter((q) => q.eq(q.field("teamId"), teamId))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("userTeams", { tenantId, userId, teamId, roleId });
  },
});

export const removeUserFromTeam = mutation({
  args: { tenantId: v.string(), id: v.id("userTeams") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// INVITATIONS
// =============================================================================

export const listInvitations = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "invitations", tenantId);
  },
});

export const getInvitationByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    return ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("invitationToken", token))
      .first();
  },
});

export const createInvitation = mutation({
  args: {
    tenantId: v.string(),
    invitationToken: v.string(),
    userEmail: v.string(),
    teamIds: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("invitations", args);
  },
});

export const removeInvitation = mutation({
  args: { tenantId: v.string(), id: v.id("invitations") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// SPOT TYPES
// =============================================================================

export const listSpotTypes = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "spotTypes", tenantId);
  },
});

export const createSpotType = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("spotTypes", args);
  },
});

export const updateSpotType = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("spotTypes"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
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

export const removeSpotType = mutation({
  args: { tenantId: v.string(), id: v.id("spotTypes") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// CLEANING STATUSES
// =============================================================================

export const listCleaningStatuses = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "cleaningStatuses", tenantId);
  },
});

export const createCleaningStatus = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    code: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    order: v.optional(v.number()),
    isInitial: v.optional(v.boolean()),
    isCleanState: v.optional(v.boolean()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("cleaningStatuses", args);
  },
});

export const updateCleaningStatus = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("cleaningStatuses"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    order: v.optional(v.number()),
    isInitial: v.optional(v.boolean()),
    isCleanState: v.optional(v.boolean()),
    description: v.optional(v.string()),
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

export const removeCleaningStatus = mutation({
  args: { tenantId: v.string(), id: v.id("cleaningStatuses") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// EXCEPTIONS (permission exceptions)
// =============================================================================

export const listExceptions = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "exceptions", tenantId);
  },
});

export const createException = mutation({
  args: {
    tenantId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    userId: v.optional(v.id("users")),
    roleId: v.optional(v.id("roles")),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("exceptions", args);
  },
});

export const removeException = mutation({
  args: { tenantId: v.string(), id: v.id("exceptions") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
