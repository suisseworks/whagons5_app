/**
 * Multi-tenancy helpers for Convex functions.
 *
 * Every query/mutation that accesses tenant data should use these helpers
 * to ensure proper data isolation.
 */
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, TableNames } from "../_generated/dataModel";
import { getAuthUser, getAuthUserOrNull } from "./auth";

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
 * For queries: returns null if not yet authenticated (reactive re-run
 * will pick up auth once established). No noisy errors in the logs.
 *
 * For mutations: throws if not authenticated (one-shot, must fail loudly).
 */
export async function withTenant(
  ctx: QueryCtx | MutationCtx,
  tenantId: string,
): Promise<TenantContext> {
  const user = await getAuthUser(ctx, tenantId);
  return { tenantId, user };
}

/**
 * Query-safe variant that returns null instead of throwing when
 * the user is not yet authenticated. Queries are reactive and will
 * automatically re-run once auth is established.
 */
export async function withTenantIfAuth(
  ctx: QueryCtx,
  tenantId: string,
): Promise<TenantContext | null> {
  const user = await getAuthUserOrNull(ctx, tenantId);
  if (!user) return null;
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
