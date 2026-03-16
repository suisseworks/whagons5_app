import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant } from "./_helpers/tenancy";
import { Doc } from "./_generated/dataModel";

export const list = query({
  args: {
    tenantId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    statusId: v.optional(v.id("statuses")),
    priorityId: v.optional(v.id("priorities")),
    categoryId: v.optional(v.id("categories")),
    teamId: v.optional(v.id("teams")),
    spotId: v.optional(v.id("spots")),
    templateId: v.optional(v.id("templates")),
  },
  handler: async (ctx, { tenantId, workspaceId, statusId, priorityId, categoryId, teamId, spotId, templateId }) => {
    await withTenant(ctx, tenantId);

    // Use the most selective index available
    let results;
    if (workspaceId) {
      results = await ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) =>
          q.eq("tenantId", tenantId).eq("workspaceId", workspaceId),
        )
        .collect();
    } else if (statusId) {
      results = await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) =>
          q.eq("tenantId", tenantId).eq("statusId", statusId),
        )
        .collect();
    } else if (categoryId) {
      results = await ctx.db
        .query("tasks")
        .withIndex("by_category", (q) =>
          q.eq("tenantId", tenantId).eq("categoryId", categoryId),
        )
        .collect();
    } else if (priorityId) {
      results = await ctx.db
        .query("tasks")
        .withIndex("by_priority", (q) =>
          q.eq("tenantId", tenantId).eq("priorityId", priorityId),
        )
        .collect();
    } else if (teamId) {
      results = await ctx.db
        .query("tasks")
        .withIndex("by_team", (q) =>
          q.eq("tenantId", tenantId).eq("teamId", teamId),
        )
        .collect();
    } else if (spotId) {
      results = await ctx.db
        .query("tasks")
        .withIndex("by_spot", (q) =>
          q.eq("tenantId", tenantId).eq("spotId", spotId),
        )
        .collect();
    } else if (templateId) {
      results = await ctx.db
        .query("tasks")
        .withIndex("by_template", (q) =>
          q.eq("tenantId", tenantId).eq("templateId", templateId),
        )
        .collect();
    } else {
      results = await ctx.db
        .query("tasks")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect();
    }

    // Exclude soft-deleted, apply remaining filters client-side
    return results.filter((t) => {
      if (t.deletedAt) return false;
      if (workspaceId && statusId && t.statusId !== statusId) return false;
      if (workspaceId && priorityId && t.priorityId !== priorityId) return false;
      if (workspaceId && categoryId && t.categoryId !== categoryId) return false;
      if (workspaceId && teamId && t.teamId !== teamId) return false;
      return true;
    });
  },
});

export const get = query({
  args: { tenantId: v.string(), id: v.id("tasks") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const task = await ctx.db.get(id);
    if (!task || task.tenantId !== tenantId || task.deletedAt) return null;
    return task;
  },
});

export const create = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    workspaceId: v.id("workspaces"),
    categoryId: v.optional(v.id("categories")),
    teamId: v.optional(v.id("teams")),
    templateId: v.optional(v.id("templates")),
    spotId: v.optional(v.id("spots")),
    statusId: v.optional(v.id("statuses")),
    priorityId: v.optional(v.id("priorities")),
    slaId: v.optional(v.id("slas")),
    dueDate: v.optional(v.number()),
    startDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("tasks", {
      ...args,
      createdBy: user._id,
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("tasks"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    statusId: v.optional(v.id("statuses")),
    priorityId: v.optional(v.id("priorities")),
    teamId: v.optional(v.id("teams")),
    spotId: v.optional(v.id("spots")),
    categoryId: v.optional(v.id("categories")),
    templateId: v.optional(v.id("templates")),
    dueDate: v.optional(v.number()),
    startDate: v.optional(v.number()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const task = await ctx.db.get(id);
    if (!task || task.tenantId !== tenantId) {
      throw new Error("Task not found");
    }
    const patch: Record<string, any> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), id: v.id("tasks") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const task = await ctx.db.get(id);
    if (!task || task.tenantId !== tenantId) {
      throw new Error("Task not found");
    }
    // Soft delete
    await ctx.db.patch(id, { deletedAt: Date.now(), updatedAt: Date.now() });
  },
});

export const restore = mutation({
  args: { tenantId: v.string(), id: v.id("tasks") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const task = await ctx.db.get(id);
    if (!task || task.tenantId !== tenantId) {
      throw new Error("Task not found");
    }
    await ctx.db.patch(id, { deletedAt: undefined, updatedAt: Date.now() });
  },
});

// ────────────────────────────────────────────────────────────────────────
// AG Grid server-side data source query
// ────────────────────────────────────────────────────────────────────────

// Map from snake_case (AG Grid column field) to camelCase (Convex schema)
const FIELD_MAP: Record<string, string> = {
  status_id: "statusId",
  priority_id: "priorityId",
  workspace_id: "workspaceId",
  category_id: "categoryId",
  team_id: "teamId",
  spot_id: "spotId",
  template_id: "templateId",
  asset_id: "assetId",
  sla_id: "slaId",
  approval_id: "approvalId",
  due_date: "dueDate",
  start_date: "startDate",
  completed_at: "completedAt",
  created_at: "_creationTime",
  updated_at: "updatedAt",
  created_by: "createdBy",
  deleted_at: "deletedAt",
  user_ids: "userIds",
  tag_ids: "tagIds",
};

/** Resolve a snake_case field to its camelCase Convex field name */
function resolveField(field: string): string {
  return FIELD_MAP[field] ?? field;
}

/**
 * Map a Convex task document to the snake_case format AG Grid columns expect.
 * Also adds `id` alias for `_id`.
 */
function toGridRow(task: Doc<"tasks">, userIds: string[], tagIds: string[]): Record<string, any> {
  return {
    // Identity
    id: task._id,
    _id: task._id,
    // Snake_case aliases for AG Grid columns
    name: task.name,
    description: task.description ?? null,
    status_id: task.statusId ?? null,
    priority_id: task.priorityId ?? null,
    workspace_id: task.workspaceId,
    category_id: task.categoryId ?? null,
    team_id: task.teamId ?? null,
    template_id: task.templateId ?? null,
    spot_id: task.spotId ?? null,
    asset_id: task.assetId ?? null,
    sla_id: task.slaId ?? null,
    approval_id: task.approvalId ?? null,
    created_by: task.createdBy ?? null,
    due_date: task.dueDate ?? null,
    start_date: task.startDate ?? null,
    completed_at: task.completedAt ?? null,
    updated_at: task.updatedAt ?? null,
    created_at: task._creationTime,
    deleted_at: task.deletedAt ?? null,
    user_ids: userIds,
    tag_ids: tagIds,
    // Keep camelCase originals too for components that use them
    statusId: task.statusId ?? null,
    priorityId: task.priorityId ?? null,
    workspaceId: task.workspaceId,
    categoryId: task.categoryId ?? null,
    teamId: task.teamId ?? null,
    spotId: task.spotId ?? null,
    tenantId: task.tenantId,
  };
}

/** Apply a single AG Grid filter condition to a value */
function matchesFilter(value: any, filter: any): boolean {
  if (!filter || typeof filter !== "object") return true;
  const ft = filter.filterType;

  if (ft === "set") {
    const vals = filter.values as any[];
    if (!vals || vals.length === 0) return true; // empty set = no filter
    return vals.some((v: any) => String(v) === String(value ?? ""));
  }

  if (ft === "text") {
    const s = String(value ?? "").toLowerCase();
    const f = String(filter.filter ?? "").toLowerCase();
    switch (filter.type) {
      case "contains": return s.includes(f);
      case "notContains": return !s.includes(f);
      case "equals": return s === f;
      case "notEqual": return s !== f;
      case "startsWith": return s.startsWith(f);
      case "endsWith": return s.endsWith(f);
      default: return s.includes(f);
    }
  }

  if (ft === "number") {
    const n = Number(value);
    const f = Number(filter.filter);
    if (!Number.isFinite(n) || !Number.isFinite(f)) return true;
    switch (filter.type) {
      case "equals": return n === f;
      case "notEqual": return n !== f;
      case "greaterThan": return n > f;
      case "greaterThanOrEqual": return n >= f;
      case "lessThan": return n < f;
      case "lessThanOrEqual": return n <= f;
      case "inRange": return n >= f && n <= Number(filter.filterTo ?? f);
      default: return true;
    }
  }

  if (ft === "date") {
    const d = value ? new Date(value).getTime() : 0;
    const fd = filter.dateFrom ? new Date(filter.dateFrom).getTime() : 0;
    const td = filter.dateTo ? new Date(filter.dateTo).getTime() : Infinity;
    switch (filter.type) {
      case "equals": return Math.abs(d - fd) < 86400000;
      case "greaterThan": return d > fd;
      case "lessThan": return d < fd;
      case "inRange": return d >= fd && d <= td;
      default: return true;
    }
  }

  return true;
}

/**
 * Paginated, filtered, sorted task query for AG Grid.
 *
 * Accepts the same filter/sort model shapes that AG Grid produces.
 * All filtering, searching, and sorting is done here on the backend.
 * The frontend only receives the requested page of rows.
 */
export const queryForGrid = query({
  args: {
    tenantId: v.string(),
    workspaceId: v.optional(v.string()),  // Convex ID string (not v.id to allow "all")
    startRow: v.number(),
    endRow: v.number(),
    search: v.optional(v.string()),
    sortModel: v.optional(v.any()),       // [{ colId, sort }]
    filterModel: v.optional(v.any()),     // { field: { filterType, ... } }
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);

    const { tenantId, workspaceId, startRow, endRow, search, sortModel, filterModel } = args;

    // ── 1. Load tasks using the most selective index ──
    let tasks: Doc<"tasks">[];
    if (workspaceId && workspaceId !== "all") {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) =>
          q.eq("tenantId", tenantId).eq("workspaceId", workspaceId as any),
        )
        .collect();
    } else {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect();
    }

    // Exclude soft-deleted
    tasks = tasks.filter((t) => !t.deletedAt);

    // ── 2. Load pivot data for user_ids and tag_ids (needed for search & display) ──
    const [taskUserRows, taskTagRows] = await Promise.all([
      ctx.db.query("taskUsers").withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId)).collect(),
      ctx.db.query("taskTags").withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId)).collect(),
    ]);
    const userIdsByTask = new Map<string, string[]>();
    for (const tu of taskUserRows) {
      const arr = userIdsByTask.get(tu.taskId) ?? [];
      arr.push(tu.userId);
      userIdsByTask.set(tu.taskId, arr);
    }
    const tagIdsByTask = new Map<string, string[]>();
    for (const tt of taskTagRows) {
      const arr = tagIdsByTask.get(tt.taskId) ?? [];
      arr.push(tt.tagId);
      tagIdsByTask.set(tt.taskId, arr);
    }

    // ── 3. Apply filterModel ──
    if (filterModel && typeof filterModel === "object") {
      const entries = Object.entries(filterModel as Record<string, any>);
      if (entries.length > 0) {
        tasks = tasks.filter((task) => {
          for (const [field, condition] of entries) {
            const convexField = resolveField(field);
            let value: any;

            if (convexField === "userIds" || field === "user_ids") {
              value = userIdsByTask.get(task._id) ?? [];
              // For set filters on arrays, check if any value matches
              if (condition?.filterType === "set" && Array.isArray(condition.values)) {
                const filterSet = new Set(condition.values.map(String));
                if (!value.some((v: string) => filterSet.has(String(v)))) return false;
                continue;
              }
            } else if (convexField === "tagIds" || field === "tag_ids") {
              value = tagIdsByTask.get(task._id) ?? [];
              if (condition?.filterType === "set" && Array.isArray(condition.values)) {
                const filterSet = new Set(condition.values.map(String));
                if (!value.some((v: string) => filterSet.has(String(v)))) return false;
                continue;
              }
            } else {
              value = (task as any)[convexField];
            }

            if (!matchesFilter(value, condition)) return false;
          }
          return true;
        });
      }
    }

    // ── 4. Apply search ──
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();

      // Load reference data for name-based search
      const [statuses, priorities, spots, users, tags] = await Promise.all([
        ctx.db.query("statuses").withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId)).collect(),
        ctx.db.query("priorities").withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId)).collect(),
        ctx.db.query("spots").withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId)).collect(),
        ctx.db.query("users").withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId)).collect(),
        ctx.db.query("tags").withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId)).collect(),
      ]);
      const statusMap = new Map(statuses.map((s) => [s._id, s]));
      const priorityMap = new Map(priorities.map((p) => [p._id, p]));
      const spotMap = new Map(spots.map((s) => [s._id, s]));
      const userMap = new Map(users.map((u) => [u._id, u]));
      const tagMap = new Map(tags.map((t) => [t._id, t]));

      tasks = tasks.filter((task) => {
        // ID
        if (task._id.toLowerCase().includes(term)) return true;
        // Name / description
        if (task.name.toLowerCase().includes(term)) return true;
        if (task.description?.toLowerCase().includes(term)) return true;
        // Status name
        const status = task.statusId ? statusMap.get(task.statusId) : null;
        if (status && (status as any).name?.toLowerCase().includes(term)) return true;
        // Priority name
        const priority = task.priorityId ? priorityMap.get(task.priorityId) : null;
        if (priority && (priority as any).name?.toLowerCase().includes(term)) return true;
        // Spot name
        const spot = task.spotId ? spotMap.get(task.spotId) : null;
        if (spot && (spot as any).name?.toLowerCase().includes(term)) return true;
        // Assigned user names
        const uids = userIdsByTask.get(task._id) ?? [];
        for (const uid of uids) {
          const u = userMap.get(uid as any);
          if (u && ((u as any).name?.toLowerCase().includes(term) || (u as any).email?.toLowerCase().includes(term))) return true;
        }
        // Tag names
        const tids = tagIdsByTask.get(task._id) ?? [];
        for (const tid of tids) {
          const tag = tagMap.get(tid as any);
          if (tag && (tag as any).name?.toLowerCase().includes(term)) return true;
        }
        return false;
      });
    }

    // ── 5. Sort ──
    const sorts: Array<{ field: string; dir: 1 | -1 }> = [];
    if (Array.isArray(sortModel) && sortModel.length > 0) {
      for (const s of sortModel) {
        sorts.push({
          field: resolveField(s.colId ?? s.field ?? "id"),
          dir: s.sort === "asc" ? 1 : -1,
        });
      }
    } else {
      // Default: newest first
      sorts.push({ field: "_creationTime", dir: -1 });
    }

    tasks.sort((a, b) => {
      for (const { field, dir } of sorts) {
        const va = (a as any)[field] ?? null;
        const vb = (b as any)[field] ?? null;
        if (va === vb) continue;
        if (va === null) return 1 * dir;
        if (vb === null) return -1 * dir;
        if (typeof va === "string" && typeof vb === "string") {
          const cmp = va.localeCompare(vb);
          if (cmp !== 0) return cmp * dir;
        } else {
          if (va < vb) return -1 * dir;
          if (va > vb) return 1 * dir;
        }
      }
      return 0;
    });

    // ── 6. Paginate & return ──
    const totalCount = tasks.length;
    const page = tasks.slice(startRow, endRow);

    return {
      rows: page.map((t) =>
        toGridRow(t, userIdsByTask.get(t._id) ?? [], tagIdsByTask.get(t._id) ?? []),
      ),
      totalCount,
    };
  },
});
