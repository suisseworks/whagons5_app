/**
 * Multi-tenancy helpers for Convex functions.
 *
 * Every query/mutation that accesses tenant data should use these helpers
 * to ensure proper data isolation.
 */
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, TableNames } from "../_generated/dataModel";
import { getAuthUser } from "./auth";

/**
 * Standard tenant context returned by `withTenant`.
 * Use this to scope all queries within a function.
 */
export interface TenantContext {
  tenantId: string;
  user: Doc<"users">;
}

/**
 * Authenticate and resolve tenant context.
 * This is the primary entry point for tenant-scoped functions.
 *
 * Usage:
 * ```ts
 * export const list = query({
 *   args: { tenantId: v.string() },
 *   handler: async (ctx, { tenantId }) => {
 *     const { user } = await withTenant(ctx, tenantId);
 *     return ctx.db.query("tasks")
 *       .withIndex("by_tenantId", q => q.eq("tenantId", tenantId))
 *       .collect();
 *   },
 * });
 * ```
 */
export async function withTenant(
  ctx: QueryCtx | MutationCtx,
  tenantId: string,
): Promise<TenantContext> {
  const user = await getAuthUser(ctx, tenantId);
  return { tenantId, user };
}

/**
 * Query all records from a table scoped to a tenant.
 * Convenience wrapper for the common pattern.
 */
export async function queryByTenant<T extends TableNames>(
  ctx: QueryCtx,
  table: T,
  tenantId: string,
): Promise<Doc<T>[]> {
  return ctx.db
    .query(table)
    .withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId))
    .collect();
}
