/**
 * Auth helpers for Convex functions.
 *
 * Provides utilities to get the current authenticated user and verify
 * tenant access in queries, mutations, and actions.
 */
import { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

export type AuthenticatedUser = Doc<"users"> & { identity: { subject: string; email?: string } };

/**
 * Try to get the current authenticated user. Returns null if not
 * authenticated or user not found — safe for reactive queries that
 * will re-run once auth is established.
 */
export async function getAuthUserOrNull(
  ctx: QueryCtx | MutationCtx,
  tenantId: string,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const firebaseUid = identity.subject;

  const user = await ctx.db
    .query("users")
    .withIndex("by_firebaseUid", (q) =>
      q.eq("tenantId", tenantId).eq("firebaseUid", firebaseUid),
    )
    .first();

  if (!user || user.deletedAt) return null;

  return user;
}

/**
 * Get the current authenticated user from the Convex auth context.
 * Throws if not authenticated or user not found in the given tenant.
 * Use for mutations; for queries prefer getAuthUserOrNull.
 */
export async function getAuthUser(
  ctx: QueryCtx | MutationCtx,
  tenantId: string,
): Promise<Doc<"users">> {
  const user = await getAuthUserOrNull(ctx, tenantId);
  if (!user) throw new Error("Not authenticated");
  return user;
}

/**
 * Get the Firebase UID from the auth context without requiring a user record.
 * Useful for login/onboarding flows before the user exists in a tenant.
 */
export async function getFirebaseUid(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
}

/**
 * Get the full identity object (includes email, name from Firebase token).
 */
export async function getIdentity(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

/**
 * Check if a user is an admin in their tenant.
 */
export function isAdmin(user: Doc<"users">): boolean {
  return user.isAdmin === true;
}

/**
 * Verify the user has access to the given tenant.
 * Returns the user if they have access, throws otherwise.
 */
export async function verifyTenantAccess(
  ctx: QueryCtx | MutationCtx,
  tenantId: string,
): Promise<Doc<"users">> {
  return getAuthUser(ctx, tenantId);
}
