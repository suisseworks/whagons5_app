import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// QR CODES
// =============================================================================

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "qrCodes", tenantId);
  },
});

export const getByUuid = query({
  args: { uuid: v.string() },
  handler: async (ctx, { uuid }) => {
    // QR codes can be scanned without tenant context (public lookup)
    return ctx.db
      .query("qrCodes")
      .withIndex("by_uuid", (q) => q.eq("uuid", uuid))
      .first();
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(),
    uuid: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    action: v.optional(v.string()),
    contentFormat: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("qrCodes", args);
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("qrCodes"),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    action: v.optional(v.string()),
    contentFormat: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
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

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("qrCodes") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// QR SCAN LOGS
// =============================================================================

export const listScanLogs = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "qrScanLogs", tenantId);
  },
});

export const logScan = mutation({
  args: {
    tenantId: v.string(),
    qrCodeId: v.id("qrCodes"),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, qrCodeId, ipAddress }) => {
    const { user } = await withTenant(ctx, tenantId);
    return ctx.db.insert("qrScanLogs", {
      tenantId,
      qrCodeId,
      userId: user._id,
      ipAddress,
      scannedAt: Date.now(),
    });
  },
});
