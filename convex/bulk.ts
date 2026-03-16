/**
 * Bulk queries for hydrating the frontend.
 * Returns all reference/lookup data for a tenant in a single round-trip.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

/**
 * Fetch all reference data for a tenant in one query.
 * The frontend ConvexDataBridge uses this to hydrate Redux.
 */
export const allReferenceData = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);

    const [
      teams,
      users,
      workspaces,
      categories,
      statuses,
      priorities,
      spots,
      spotTypes,
      tags,
      templates,
      cleaningStatuses,
      statusTransitionGroups,
      statusTransitions,
      forms,
      formVersions,
    ] = await Promise.all([
      queryByTenant(ctx, "teams", tenantId),
      queryByTenant(ctx, "users", tenantId),
      queryByTenant(ctx, "workspaces", tenantId),
      queryByTenant(ctx, "categories", tenantId),
      queryByTenant(ctx, "statuses", tenantId),
      queryByTenant(ctx, "priorities", tenantId),
      queryByTenant(ctx, "spots", tenantId),
      queryByTenant(ctx, "spotTypes", tenantId),
      queryByTenant(ctx, "tags", tenantId),
      queryByTenant(ctx, "templates", tenantId),
      queryByTenant(ctx, "cleaningStatuses", tenantId),
      queryByTenant(ctx, "statusTransitionGroups", tenantId),
      queryByTenant(ctx, "statusTransitions", tenantId),
      queryByTenant(ctx, "forms", tenantId),
      queryByTenant(ctx, "formVersions", tenantId),
    ]);

    return {
      teams,
      users,
      workspaces,
      categories,
      statuses,
      priorities,
      spots,
      spotTypes,
      tags,
      templates,
      cleaningStatuses,
      statusTransitionGroups,
      statusTransitions,
      forms,
      formVersions,
    };
  },
});

/**
 * Fetch tasks for a tenant.
 *
 * Returns up to `limit` tasks (default 4096) to avoid exceeding Convex's
 * query result size limits. For large tenants, the frontend should use
 * paginated queries or workspace-scoped queries instead.
 */
export const tasksByWorkspace = query({
  args: {
    tenantId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { tenantId, limit }) => {
    await withTenant(ctx, tenantId);

    // Cap at a safe limit to avoid exceeding Convex response size limits.
    // 23K+ tasks with full documents will exceed the ~8MB response limit.
    const safeLimit = limit ?? 4096;

    return ctx.db
      .query("tasks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .take(safeLimit);
  },
});

/**
 * Fetch task pivot data (taskUsers, taskTags) for a tenant.
 */
export const taskPivotData = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);

    // These might not exist yet in the DB, so wrap in try/catch
    let taskUsers: any[] = [];
    let taskTags: any[] = [];

    try {
      taskUsers = await queryByTenant(ctx, "taskUsers", tenantId);
    } catch (_) {}
    try {
      taskTags = await queryByTenant(ctx, "taskTags", tenantId);
    } catch (_) {}

    return { taskUsers, taskTags };
  },
});
