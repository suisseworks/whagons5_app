import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => { await withTenant(ctx, tenantId); return queryByTenant(ctx, "roles", tenantId); },
});

export const create = mutation({
  args: { tenantId: v.string(), name: v.string(), guardName: v.optional(v.string()) },
  handler: async (ctx, args) => { await withTenant(ctx, args.tenantId); return ctx.db.insert("roles", args); },
});

export const update = mutation({
  args: { tenantId: v.string(), id: v.id("roles"), name: v.optional(v.string()) },
  handler: async (ctx, { tenantId, id, ...u }) => {
    await withTenant(ctx, tenantId); const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    if (u.name !== undefined) await ctx.db.patch(id, { name: u.name }); return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("roles") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId); const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found"); await ctx.db.delete(id);
  },
});

// --- Permissions ---
export const listPermissions = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => { await withTenant(ctx, tenantId); return queryByTenant(ctx, "permissions", tenantId); },
});

// --- Role Permissions (pivot) ---
export const listRolePermissions = query({
  args: { tenantId: v.string(), roleId: v.id("roles") },
  handler: async (ctx, { tenantId, roleId }) => {
    await withTenant(ctx, tenantId);
    return ctx.db.query("rolePermissions").withIndex("by_roleId", (q) => q.eq("tenantId", tenantId).eq("roleId", roleId)).collect();
  },
});

export const assignPermission = mutation({
  args: { tenantId: v.string(), roleId: v.id("roles"), permissionId: v.id("permissions") },
  handler: async (ctx, args) => { await withTenant(ctx, args.tenantId); return ctx.db.insert("rolePermissions", args); },
});

export const removePermission = mutation({
  args: { tenantId: v.string(), id: v.id("rolePermissions") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId); const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found"); await ctx.db.delete(id);
  },
});
