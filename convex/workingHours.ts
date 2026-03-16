import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withTenant, queryByTenant } from "./_helpers/tenancy";

// =============================================================================
// COUNTRY CONFIGS
// =============================================================================

export const listCountryConfigs = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "countryConfigs", tenantId);
  },
});

export const createCountryConfig = mutation({
  args: {
    tenantId: v.string(),
    countryCode: v.string(),
    countryName: v.string(),
    defaultWeeklyHours: v.optional(v.number()),
    maxDailyHours: v.optional(v.number()),
    minBreakAfterHours: v.optional(v.number()),
    minBreakDurationMinutes: v.optional(v.number()),
    overtimeThresholdDaily: v.optional(v.number()),
    overtimeThresholdWeekly: v.optional(v.number()),
    settings: v.optional(v.any()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("countryConfigs", args);
  },
});

export const updateCountryConfig = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("countryConfigs"),
    countryCode: v.optional(v.string()),
    countryName: v.optional(v.string()),
    defaultWeeklyHours: v.optional(v.number()),
    maxDailyHours: v.optional(v.number()),
    minBreakAfterHours: v.optional(v.number()),
    minBreakDurationMinutes: v.optional(v.number()),
    overtimeThresholdDaily: v.optional(v.number()),
    overtimeThresholdWeekly: v.optional(v.number()),
    settings: v.optional(v.any()),
    isActive: v.optional(v.boolean()),
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

export const removeCountryConfig = mutation({
  args: { tenantId: v.string(), id: v.id("countryConfigs") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// OVERTIME RULES
// =============================================================================

export const listOvertimeRules = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "overtimeRules", tenantId);
  },
});

export const createOvertimeRule = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    countryConfigId: v.optional(v.id("countryConfigs")),
    dailyThresholdHours: v.optional(v.number()),
    weeklyThresholdHours: v.optional(v.number()),
    requireApproval: v.optional(v.boolean()),
    maxOvertimeDaily: v.optional(v.number()),
    maxOvertimeWeekly: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("overtimeRules", args);
  },
});

export const updateOvertimeRule = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("overtimeRules"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    dailyThresholdHours: v.optional(v.number()),
    weeklyThresholdHours: v.optional(v.number()),
    requireApproval: v.optional(v.boolean()),
    maxOvertimeDaily: v.optional(v.number()),
    maxOvertimeWeekly: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
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

export const removeOvertimeRule = mutation({
  args: { tenantId: v.string(), id: v.id("overtimeRules") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// OVERTIME MULTIPLIERS
// =============================================================================

export const listOvertimeMultipliers = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "overtimeMultipliers", tenantId);
  },
});

export const createOvertimeMultiplier = mutation({
  args: {
    tenantId: v.string(),
    overtimeRuleId: v.id("overtimeRules"),
    multiplierType: v.optional(v.string()),
    thresholdHours: v.optional(v.number()),
    multiplier: v.optional(v.number()),
    priority: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("overtimeMultipliers", args);
  },
});

export const removeOvertimeMultiplier = mutation({
  args: { tenantId: v.string(), id: v.id("overtimeMultipliers") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// HOLIDAY CALENDARS
// =============================================================================

export const listHolidayCalendars = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "holidayCalendars", tenantId);
  },
});

export const createHolidayCalendar = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    countryConfigId: v.optional(v.id("countryConfigs")),
    regionCode: v.optional(v.string()),
    calendarYear: v.optional(v.number()),
    source: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("holidayCalendars", args);
  },
});

export const updateHolidayCalendar = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("holidayCalendars"),
    name: v.optional(v.string()),
    regionCode: v.optional(v.string()),
    calendarYear: v.optional(v.number()),
    source: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
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

export const removeHolidayCalendar = mutation({
  args: { tenantId: v.string(), id: v.id("holidayCalendars") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// HOLIDAYS
// =============================================================================

export const listHolidays = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "holidays", tenantId);
  },
});

export const createHoliday = mutation({
  args: {
    tenantId: v.string(),
    holidayCalendarId: v.id("holidayCalendars"),
    name: v.string(),
    date: v.number(),
    description: v.optional(v.string()),
    holidayType: v.optional(v.string()),
    isHalfDay: v.optional(v.boolean()),
    isRecurring: v.optional(v.boolean()),
    affectsOvertime: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await withTenant(ctx, args.tenantId);
    return ctx.db.insert("holidays", args);
  },
});

export const updateHoliday = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("holidays"),
    name: v.optional(v.string()),
    date: v.optional(v.number()),
    description: v.optional(v.string()),
    holidayType: v.optional(v.string()),
    isHalfDay: v.optional(v.boolean()),
    isRecurring: v.optional(v.boolean()),
    affectsOvertime: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
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

export const removeHoliday = mutation({
  args: { tenantId: v.string(), id: v.id("holidays") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// WORKING SCHEDULES
// =============================================================================

export const listSchedules = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "workingSchedules", tenantId);
  },
});

export const createSchedule = mutation({
  args: {
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    scheduleType: v.optional(v.string()),
    weeklyHours: v.optional(v.number()),
    countryConfigId: v.optional(v.id("countryConfigs")),
    holidayCalendarId: v.optional(v.id("holidayCalendars")),
    overtimeRuleId: v.optional(v.id("overtimeRules")),
    isDefault: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("workingSchedules", { ...args, createdBy: user._id });
  },
});

export const updateSchedule = mutation({
  args: {
    tenantId: v.string(),
    id: v.id("workingSchedules"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    scheduleType: v.optional(v.string()),
    weeklyHours: v.optional(v.number()),
    countryConfigId: v.optional(v.id("countryConfigs")),
    holidayCalendarId: v.optional(v.id("holidayCalendars")),
    overtimeRuleId: v.optional(v.id("overtimeRules")),
    isDefault: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
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

export const removeSchedule = mutation({
  args: { tenantId: v.string(), id: v.id("workingSchedules") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// =============================================================================
// SCHEDULE ASSIGNMENTS
// =============================================================================

export const listScheduleAssignments = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await withTenant(ctx, tenantId);
    return queryByTenant(ctx, "scheduleAssignments", tenantId);
  },
});

export const createScheduleAssignment = mutation({
  args: {
    tenantId: v.string(),
    workingScheduleId: v.id("workingSchedules"),
    assignableType: v.string(),
    assignableId: v.string(),
    priority: v.optional(v.number()),
    effectiveFrom: v.optional(v.number()),
    effectiveTo: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await withTenant(ctx, args.tenantId);
    return ctx.db.insert("scheduleAssignments", { ...args, createdBy: user._id });
  },
});

export const removeScheduleAssignment = mutation({
  args: { tenantId: v.string(), id: v.id("scheduleAssignments") },
  handler: async (ctx, { tenantId, id }) => {
    await withTenant(ctx, tenantId);
    const doc = await ctx.db.get(id);
    if (!doc || doc.tenantId !== tenantId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
