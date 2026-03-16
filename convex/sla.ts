import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// --- SLAs ---
export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "slas", tenantId);
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(), name: v.string(), description: v.optional(v.string()),
    runbook: v.optional(v.string()), enabled: v.optional(v.boolean()), color: v.optional(v.string()),
    responseTimeTarget: v.optional(v.number()), responseTime: v.optional(v.number()),
    resolutionTimeTarget: v.optional(v.number()), resolutionTime: v.optional(v.number()),
    slaPolicyId: v.optional(v.id("slaPolicies")),
  },
  handler: async (ctx, args) => { await withTenant(ctx, args.tenantId); return ctx.db.insert("slas", args); },
});

export const update = mutation({
  args: {
    tenantId: v.string(), id: v.id("slas"), name: v.optional(v.string()),
    description: v.optional(v.string()), runbook: v.optional(v.string()),
    enabled: v.optional(v.boolean()), color: v.optional(v.string()),
    responseTimeTarget: v.optional(v.number()), responseTime: v.optional(v.number()),
    resolutionTimeTarget: v.optional(v.number()), resolutionTime: v.optional(v.number()),
  },
  handler: async (ctx, { tenantId, id, ...u }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("SLA not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(u)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("slas") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id); if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// --- SLA Alerts ---
export const listAlerts = query({
  args: { tenantId: v.string(), slaId: v.id("slas") },
  handler: async (ctx, { tenantId, slaId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("slaAlerts").withIndex("by_slaId", (q) => q.eq("tenantId", tenantId).eq("slaId", slaId)).collect();
  },
});

// --- SLA Escalation Levels ---
export const listEscalations = query({
  args: { tenantId: v.string(), slaId: v.id("slas") },
  handler: async (ctx, { tenantId, slaId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("slaEscalationLevels").withIndex("by_slaId", (q) => q.eq("tenantId", tenantId).eq("slaId", slaId)).collect();
  },
});

// --- SLA Policies ---
export const listPolicies = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "slaPolicies", tenantId);
  },
});
