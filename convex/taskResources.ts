import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, withTenantIfAuth } from "./_helpers/tenancy";

// =============================================================================
// TASK USERS (assignments)
// =============================================================================

export const listTaskUsers = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("taskUsers")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .collect();
  },
});

export const listByUser = query({
  args: { tenantId: v.string(), userId: v.id("users") },
  handler: async (ctx, { tenantId, userId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("taskUsers")
      .withIndex("by_userId", (q) => q.eq("tenantId", tenantId).eq("userId", userId))
      .collect();
  },
});

export const assignUser = mutation({
  args: { tenantId: v.string(), taskId: v.id("tasks"), userId: v.id("users") },
  handler: async (ctx, { tenantId, taskId, userId }) => {
    await withTenant(ctx, tenantId);
    // Check for duplicate
    const existing = await ctx.db
      .query("taskUsers")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("taskUsers", { tenantId, taskId, userId });
  },
});

export const unassignUser = mutation({
  args: { tenantId: v.string(), id: v.id("taskUsers") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// TASK TAGS
// =============================================================================

export const listTaskTags = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("taskTags")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .collect();
  },
});

export const addTag = mutation({
  args: { tenantId: v.string(), taskId: v.id("tasks"), tagId: v.id("tags") },
  handler: async (ctx, { tenantId, taskId, tagId }) => {
    const { user } = await withTenant(ctx, tenantId);
    const existing = await ctx.db
      .query("taskTags")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .filter((q) => q.eq(q.field("tagId"), tagId))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("taskTags", { tenantId, taskId, tagId, userId: user._id });
  },
});

export const removeTag = mutation({
  args: { tenantId: v.string(), id: v.id("taskTags") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

/**
 * Add a tag to a task using pgId numbers (for grid compatibility).
 * Resolves pgIds → Convex IDs server-side.
 */
export const addTagByPgId = mutation({
  args: { tenantId: v.string(), taskPgId: v.number(), tagPgId: v.number() },
  handler: async (ctx, { tenantId, taskPgId, tagPgId }) => {
    const { user } = await withTenant(ctx, tenantId);
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .filter((q) => q.eq(q.field("pgId"), taskPgId))
      .first();
    if (!task) throw new Error(`Task with pgId ${taskPgId} not found`);
    const tag = await ctx.db
      .query("tags")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .filter((q) => q.eq(q.field("pgId"), tagPgId))
      .first();
    if (!tag) throw new Error(`Tag with pgId ${tagPgId} not found`);
    const existing = await ctx.db
      .query("taskTags")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", task._id))
      .filter((q) => q.eq(q.field("tagId"), tag._id))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("taskTags", { tenantId, taskId: task._id, tagId: tag._id, userId: user._id });
  },
});

/**
 * Remove a tag from a task using pgId numbers (for grid compatibility).
 */
export const removeTagByPgId = mutation({
  args: { tenantId: v.string(), taskPgId: v.number(), tagPgId: v.number() },
  handler: async (ctx, { tenantId, taskPgId, tagPgId }) => {
    await withTenant(ctx, tenantId);
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .filter((q) => q.eq(q.field("pgId"), taskPgId))
      .first();
    if (!task) throw new Error(`Task with pgId ${taskPgId} not found`);
    const tag = await ctx.db
      .query("tags")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .filter((q) => q.eq(q.field("pgId"), tagPgId))
      .first();
    if (!tag) throw new Error(`Tag with pgId ${tagPgId} not found`);
    const tt = await ctx.db
      .query("taskTags")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", task._id))
      .filter((q) => q.eq(q.field("tagId"), tag._id))
      .first();
    if (!tt) throw new Error("Task tag not found");
    await ctx.db.delete(tt._id);
  },
});

// =============================================================================
// TASK SHARES
// =============================================================================

export const listTaskShares = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("taskShares")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .collect();
  },
});

export const listSharedToUser = query({
  args: { tenantId: v.string(), userId: v.id("users") },
  handler: async (ctx, { tenantId, userId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("taskShares")
      .withIndex("by_sharedToUserId", (q) => q.eq("tenantId", tenantId).eq("sharedToUserId", userId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();
  },
});

export const shareTask = mutation({
  args: {
    tenantId: v.string(),
    taskId: v.id("tasks"),
    sharedToUserId: v.optional(v.id("users")),
    sharedToTeamId: v.optional(v.id("teams")),
    permission: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, taskId, sharedToUserId, sharedToTeamId, permission }) => {
    const { user } = await withTenant(ctx, tenantId);
    return ctx.db.insert("taskShares", {
      tenantId,
      taskId,
      sharedByUserId: user._id,
      sharedToUserId,
      sharedToTeamId,
      permission,
    });
  },
});

export const revokeShare = mutation({
  args: { tenantId: v.string(), id: v.id("taskShares") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.patch(id, { revokedAt: Date.now() });
  },
});

// =============================================================================
// TASK RELATIONS
// =============================================================================

export const listTaskRelations = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("taskRelations")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .collect();
  },
});

export const addRelation = mutation({
  args: {
    tenantId: v.string(),
    taskId: v.id("tasks"),
    relatedTaskId: v.id("tasks"),
    relationType: v.string(),
  },
  handler: async (ctx, { tenantId, taskId, relatedTaskId, relationType }) => {
    const { user } = await withTenant(ctx, tenantId);
    return ctx.db.insert("taskRelations", {
      tenantId,
      taskId,
      relatedTaskId,
      relationType,
      createdBy: user._id,
    });
  },
});

export const removeRelation = mutation({
  args: { tenantId: v.string(), id: v.id("taskRelations") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// TASK LOGS
// =============================================================================

export const listTaskLogs = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("taskLogs")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .collect();
  },
});

export const createTaskLog = mutation({
  args: {
    tenantId: v.string(),
    taskId: v.id("tasks"),
    action: v.string(),
    oldValues: v.optional(v.any()),
    newValues: v.optional(v.any()),
    uuid: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, taskId, action, oldValues, newValues, uuid }) => {
    const { user } = await withTenant(ctx, tenantId);
    return ctx.db.insert("taskLogs", {
      tenantId,
      taskId,
      userId: user._id,
      action,
      oldValues,
      newValues,
      uuid,
    });
  },
});

// =============================================================================
// TASK NOTES
// =============================================================================

export const listTaskNotes = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("taskNotes")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .collect();
  },
});

export const createNote = mutation({
  args: {
    tenantId: v.string(),
    taskId: v.id("tasks"),
    note: v.optional(v.string()),
    uuid: v.optional(v.string()),
    attachments: v.optional(v.array(v.object({
      storageId: v.id("_storage"),
      fileName: v.string(),
      fileSize: v.number(),
      fileType: v.string(),
    }))),
  },
  handler: async (ctx, { tenantId, taskId, note, uuid, attachments }) => {
    const { user } = await withTenant(ctx, tenantId);
    return ctx.db.insert("taskNotes", {
      tenantId,
      taskId,
      note,
      userId: user._id,
      uuid,
      attachments,
    });
  },
});

/** Generate a short-lived upload URL for Convex file storage. */
export const generateUploadUrl = mutation({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return ctx.storage.generateUploadUrl();
  },
});

export const updateNote = mutation({
  args: { tenantId: v.string(), id: v.id("taskNotes"), note: v.string() },
  handler: async (ctx, { tenantId, id, note }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.patch(id, { note });
    return id;
  },
});

export const removeNote = mutation({
  args: { tenantId: v.string(), id: v.id("taskNotes") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

/** Get a serving URL for a file in Convex storage. */
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return ctx.storage.getUrl(storageId);
  },
});

// =============================================================================
// TASK ATTACHMENTS (legacy — kept for backward compat)
// =============================================================================

export const listTaskAttachments = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("taskAttachments")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .collect();
  },
});

export const createAttachment = mutation({
  args: {
    tenantId: v.string(),
    taskId: v.id("tasks"),
    type: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    filePath: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileExtension: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    uuid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("taskAttachments", { ...args, userId: user._id });
  },
});

export const removeAttachment = mutation({
  args: { tenantId: v.string(), id: v.id("taskAttachments") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// TASK SIGNATURES
// =============================================================================

export const listTaskSignatures = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("taskSignatures")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .collect();
  },
});

export const createSignature = mutation({
  args: {
    tenantId: v.string(),
    taskId: v.id("tasks"),
    signaturePath: v.optional(v.string()),
    signerName: v.optional(v.string()),
    comment: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, taskId, ...rest }) => {
    const { user } = await withTenant(ctx, tenantId);
    return ctx.db.insert("taskSignatures", {
      tenantId,
      taskId,
      userId: user._id,
      signedAt: Date.now(),
      ...rest,
    });
  },
});

// =============================================================================
// TASK RECURRENCES
// =============================================================================

export const listRecurrences = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("taskRecurrences")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();
  },
});

export const getRecurrence = query({
  args: { tenantId: v.string(), id: v.id("taskRecurrences") },
  handler: async (ctx, { tenantId, id }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return null;
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) return null;
    return doc;
  },
});

export const createRecurrence = mutation({
  args: {
    tenantId: v.string(),
    rrule: v.string(),
    dtstart: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    categoryId: v.optional(v.id("categories")),
    teamId: v.optional(v.id("teams")),
    templateId: v.optional(v.id("templates")),
    priorityId: v.optional(v.id("priorities")),
    statusId: v.optional(v.id("statuses")),
    userIds: v.optional(v.any()),
    isActive: v.optional(v.boolean()),
    customFieldValues: v.optional(v.any()),
    spotId: v.optional(v.id("spots")),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("taskRecurrences", {
      ...args,
      createdBy: user._id,
      occurrencesGenerated: 0,
    });
  },
});

export const updateRecurrence = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("taskRecurrences"),
    rrule: v.optional(v.string()),
    dtstart: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    categoryId: v.optional(v.id("categories")),
    teamId: v.optional(v.id("teams")),
    templateId: v.optional(v.id("templates")),
    priorityId: v.optional(v.id("priorities")),
    statusId: v.optional(v.id("statuses")),
    userIds: v.optional(v.any()),
    isActive: v.optional(v.boolean()),
    customFieldValues: v.optional(v.any()),
    spotId: v.optional(v.id("spots")),
    lastGeneratedAt: v.optional(v.number()),
    occurrencesGenerated: v.optional(v.number()),
  },
  handler: async (ctx, { tenantId, id, ...updates }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Recurrence not found");
    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) if (val !== undefined) patch[k] = val;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return id;
  },
});

export const removeRecurrence = mutation({
  args: { tenantId: v.string(), id: v.id("taskRecurrences") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// STATUS TRANSITION LOGS
// =============================================================================

export const listTransitionLogs = query({
  args: { tenantId: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { tenantId, taskId }) => {
    if (!(await withTenantIfAuth(ctx, tenantId))) return [];
    return ctx.db
      .query("statusTransitionLogs")
      .withIndex("by_taskId", (q) => q.eq("tenantId", tenantId).eq("taskId", taskId))
      .collect();
  },
});

export const createTransitionLog = mutation({
  args: {
    tenantId: v.string(),
    taskId: v.id("tasks"),
    type: v.optional(v.string()),
    fromStatus: v.optional(v.id("statuses")),
    toStatus: v.optional(v.id("statuses")),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("statusTransitionLogs", { ...args, userId: user._id });
  },
});
