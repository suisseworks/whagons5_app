/**
 * Migration mutation: seed a tenant's reference data from Postgres export.
 * Called by the local migration script (scripts/migrate-pg-to-convex.mjs).
 *
 * Accepts a batch of rows for a single table and inserts them.
 * The script handles ID mapping (Postgres int → Convex Id) by running
 * tables in dependency order and tracking the mapping.
 */
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const insertBatch = internalMutation({
  args: {
    table: v.string(),
    rows: v.array(v.any()),
  },
  handler: async (ctx, { table, rows }) => {
    const ids: { pgId: number; convexId: string }[] = [];
    for (const row of rows) {
      const id = await ctx.db.insert(table as any, row);
      ids.push({ pgId: row._pgId ?? 0, convexId: id });
    }
    return ids;
  },
});

export const clearTable = internalMutation({
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
