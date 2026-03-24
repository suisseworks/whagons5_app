import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// =============================================================================
// Whagons Convex Schema
// =============================================================================
// Multi-tenancy: every table has `tenantId` (string = domain prefix like "acme")
// All FKs use v.id("tableName") for Convex-native references
// camelCase field names (Convex convention)
// _creationTime is auto-added by Convex (replaces created_at)
// =============================================================================

export default defineSchema({
  // ===========================================================================
  // TENANTS & USERS
  // ===========================================================================

  tenants: defineTable({
    domain: v.string(), // unique subdomain prefix (e.g., "acme")
    name: v.string(),
    database: v.optional(v.string()), // legacy reference
  })
    .index("by_domain", ["domain"]),

  // Maps Firebase UID → tenant access (one entry per user-tenant pair)
  userTenantMap: defineTable({
    firebaseUid: v.string(),
    tenantId: v.string(),
  })
    .index("by_firebaseUid", ["firebaseUid"])
    .index("by_tenantId", ["tenantId"]),

  users: defineTable({
    tenantId: v.string(),
    firebaseUid: v.string(),
    name: v.string(),
    email: v.string(),
    jobPositionId: v.optional(v.id("jobPositions")),
    spots: v.optional(v.array(v.string())), // spot IDs the user can see
    urlPicture: v.optional(v.string()),
    color: v.optional(v.string()),
    availabilityStatus: v.optional(v.string()),
    organizationName: v.optional(v.string()),
    stripeId: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()),
    hasActiveSubscription: v.optional(v.boolean()),
    initializationStage: v.number(), // 0: needs onboarding, 1: has name, -1: completed
    settings: v.optional(v.any()), // JSON user preferences
    deletedAt: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_firebaseUid", ["tenantId", "firebaseUid"])
    .index("by_email", ["tenantId", "email"]),

  // ===========================================================================
  // ORGANIZATION HIERARCHY
  // ===========================================================================

  teams: defineTable({
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    allowMultitasking: v.optional(v.boolean()),
    parentTeamId: v.optional(v.id("teams")),
    teamLeadId: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  userTeams: defineTable({
    tenantId: v.string(),
    userId: v.id("users"),
    teamId: v.id("teams"),
    roleId: v.optional(v.id("roles")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_userId", ["tenantId", "userId"])
    .index("by_teamId", ["tenantId", "teamId"]),

  workspaces: defineTable({
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    teams: v.optional(v.array(v.id("teams"))), // teams with access
    viewModes: v.optional(v.any()), // JSON
    allowAdHocTasks: v.optional(v.boolean()),
    type: v.optional(v.string()), // "DEFAULT" | "PROJECT"
    categoryId: v.optional(v.id("categories")), // for PROJECT workspaces
    spots: v.optional(v.array(v.string())),
    createdBy: v.optional(v.id("users")),
    deletedAt: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"]),

  categories: defineTable({
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    slaId: v.optional(v.id("slas")),
    teamId: v.optional(v.id("teams")),
    workspaceId: v.optional(v.id("workspaces")),
    reportingTeamIds: v.optional(v.any()), // JSON array
    celebrationEffect: v.optional(v.string()),
    dialogLayout: v.optional(v.any()), // JSON
    taskCreationMode: v.optional(v.string()),
    spotsNotApplicable: v.optional(v.boolean()),
    defaultPriorityId: v.optional(v.id("priorities")),
    defaultUserIds: v.optional(v.any()), // JSON array
    defaultSpotId: v.optional(v.id("spots")),
    defaultTagIds: v.optional(v.any()), // JSON array
    statusTransitionGroupId: v.optional(v.id("statusTransitionGroups")),
    approvalId: v.optional(v.id("approvals")),
    notificationTone: v.optional(v.string()),
    allowTemplatelessTasks: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_workspaceId", ["tenantId", "workspaceId"]),

  // ===========================================================================
  // REFERENCE TABLES
  // ===========================================================================

  statuses: defineTable({
    tenantId: v.string(),
    name: v.string(),
    action: v.optional(v.string()), // "WORKING" | "FINISHED" | etc.
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    system: v.optional(v.boolean()),
    initial: v.optional(v.boolean()),
    final: v.optional(v.boolean()),
    categoryId: v.optional(v.id("categories")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_categoryId", ["tenantId", "categoryId"]),

  priorities: defineTable({
    tenantId: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    slaId: v.optional(v.id("slas")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_categoryId", ["tenantId", "categoryId"]),

  categoryPriorities: defineTable({
    tenantId: v.string(),
    priorityId: v.id("priorities"),
    categoryId: v.id("categories"),
    slaId: v.optional(v.id("slas")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_categoryId", ["tenantId", "categoryId"]),

  spots: defineTable({
    tenantId: v.string(),
    name: v.string(),
    alias: v.optional(v.string()),
    parentId: v.optional(v.id("spots")),
    spotTypeId: v.optional(v.id("spotTypes")),
    isBranch: v.optional(v.boolean()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    cleaningStatusId: v.optional(v.id("cleaningStatuses")),
    currentCleaningTaskId: v.optional(v.id("tasks")),
    lastCleanedBy: v.optional(v.id("users")),
    lastCleanedAt: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_parentId", ["tenantId", "parentId"]),

  spotTypes: defineTable({
    tenantId: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  tags: defineTable({
    tenantId: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
  })
    .index("by_tenantId", ["tenantId"]),

  templates: defineTable({
    tenantId: v.string(),
    name: v.string(),
    alias: v.optional(v.string()),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    priorityId: v.optional(v.id("priorities")),
    slaId: v.optional(v.id("slas")),
    approvalId: v.optional(v.id("approvals")),
    defaultSpotId: v.optional(v.id("spots")),
    spotsNotApplicable: v.optional(v.boolean()),
    expectedDuration: v.optional(v.number()),
    defaultUserIds: v.optional(v.any()), // JSON array
    formId: v.optional(v.id("forms")),
    enabled: v.optional(v.boolean()),
    isPrivate: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_categoryId", ["tenantId", "categoryId"]),

  cleaningStatuses: defineTable({
    tenantId: v.string(),
    name: v.string(),
    code: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    order: v.optional(v.number()),
    isInitial: v.optional(v.boolean()),
    isCleanState: v.optional(v.boolean()),
    description: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // STATUS TRANSITIONS & WORKFLOW
  // ===========================================================================

  statusTransitionGroups: defineTable({
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"]),

  statusTransitions: defineTable({
    tenantId: v.string(),
    statusTransitionGroupId: v.id("statusTransitionGroups"),
    fromStatus: v.optional(v.id("statuses")),
    toStatus: v.id("statuses"),
    initial: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_groupId", ["tenantId", "statusTransitionGroupId"]),

  // ===========================================================================
  // TASKS (core domain)
  // ===========================================================================

  tasks: defineTable({
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
    approvalId: v.optional(v.id("approvals")),
    assetId: v.optional(v.id("assetItems")),
    createdBy: v.optional(v.id("users")),
    recurrenceId: v.optional(v.id("taskRecurrences")),
    // SLA runtime fields
    slaStartedAt: v.optional(v.number()),
    slaResponseDeadline: v.optional(v.number()),
    slaResolutionDeadline: v.optional(v.number()),
    slaRespondedAt: v.optional(v.number()),
    slaResolvedAt: v.optional(v.number()),
    slaPausedAt: v.optional(v.number()),
    slaPausedDuration: v.optional(v.number()),
    // Dates
    dueDate: v.optional(v.number()),
    startDate: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    // Soft delete
    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_workspace", ["tenantId", "workspaceId"])
    .index("by_status", ["tenantId", "statusId"])
    .index("by_category", ["tenantId", "categoryId"])
    .index("by_priority", ["tenantId", "priorityId"])
    .index("by_team", ["tenantId", "teamId"])
    .index("by_spot", ["tenantId", "spotId"])
    .index("by_template", ["tenantId", "templateId"])
    .index("by_createdBy", ["tenantId", "createdBy"]),

  // Task pivot tables
  taskUsers: defineTable({
    tenantId: v.string(),
    taskId: v.id("tasks"),
    userId: v.id("users"),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"])
    .index("by_userId", ["tenantId", "userId"]),

  taskTags: defineTable({
    tenantId: v.string(),
    taskId: v.id("tasks"),
    tagId: v.id("tags"),
    userId: v.optional(v.id("users")), // who added the tag
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"]),

  taskShares: defineTable({
    tenantId: v.string(),
    taskId: v.id("tasks"),
    sharedByUserId: v.id("users"),
    sharedToUserId: v.optional(v.id("users")),
    sharedToTeamId: v.optional(v.id("teams")),
    permission: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
    status: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"])
    .index("by_sharedToUserId", ["tenantId", "sharedToUserId"])
    .index("by_sharedToTeamId", ["tenantId", "sharedToTeamId"]),

  taskRelations: defineTable({
    tenantId: v.string(),
    taskId: v.id("tasks"),
    relatedTaskId: v.id("tasks"),
    relationType: v.string(), // "blocks" | "related"
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"]),

  taskLogs: defineTable({
    tenantId: v.string(),
    uuid: v.optional(v.string()),
    taskId: v.id("tasks"),
    userId: v.optional(v.id("users")),
    action: v.string(),
    oldValues: v.optional(v.any()), // JSON
    newValues: v.optional(v.any()), // JSON
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"]),

  taskNotes: defineTable({
    tenantId: v.string(),
    uuid: v.optional(v.string()),
    taskId: v.id("tasks"),
    note: v.optional(v.string()), // text content (optional — a comment can be files-only)
    userId: v.optional(v.id("users")),
    // Inline attachments: images/files attached to this comment
    attachments: v.optional(v.array(v.object({
      storageId: v.id("_storage"),
      fileName: v.string(),
      fileSize: v.number(),
      fileType: v.string(), // MIME type e.g. "image/png", "application/pdf"
    }))),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"]),

  taskAttachments: defineTable({
    tenantId: v.string(),
    uuid: v.optional(v.string()),
    taskId: v.id("tasks"),
    type: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")), // Convex file storage
    filePath: v.optional(v.string()), // legacy or external URL
    fileName: v.optional(v.string()),
    fileExtension: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"]),

  taskSignatures: defineTable({
    tenantId: v.string(),
    taskId: v.id("tasks"),
    userId: v.id("users"),
    signaturePath: v.optional(v.string()),
    signerName: v.optional(v.string()),
    comment: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    signedAt: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"]),

  taskRecurrences: defineTable({
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
    userIds: v.optional(v.any()), // JSON array
    createdBy: v.optional(v.id("users")),
    isActive: v.optional(v.boolean()),
    lastGeneratedAt: v.optional(v.number()),
    count: v.optional(v.number()),
    occurrencesGenerated: v.optional(v.number()),
    customFieldValues: v.optional(v.any()), // JSON
    spotId: v.optional(v.id("spots")),
  })
    .index("by_tenantId", ["tenantId"]),

  statusTransitionLogs: defineTable({
    tenantId: v.string(),
    taskId: v.id("tasks"),
    type: v.optional(v.string()),
    fromStatus: v.optional(v.id("statuses")),
    toStatus: v.optional(v.id("statuses")),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"]),

  // ===========================================================================
  // CUSTOM FIELDS
  // ===========================================================================

  customFields: defineTable({
    tenantId: v.string(),
    name: v.string(),
    fieldType: v.string(),
    options: v.optional(v.any()), // JSON
    validationRules: v.optional(v.any()), // JSON
  })
    .index("by_tenantId", ["tenantId"]),

  categoryCustomFields: defineTable({
    tenantId: v.string(),
    fieldId: v.id("customFields"),
    categoryId: v.id("categories"),
    isRequired: v.optional(v.boolean()),
    order: v.optional(v.number()),
    defaultValue: v.optional(v.any()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_categoryId", ["tenantId", "categoryId"]),

  templateCustomFields: defineTable({
    tenantId: v.string(),
    fieldId: v.id("customFields"),
    templateId: v.id("templates"),
    isRequired: v.optional(v.boolean()),
    order: v.optional(v.number()),
    defaultValue: v.optional(v.any()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_templateId", ["tenantId", "templateId"]),

  taskCustomFieldValues: defineTable({
    tenantId: v.string(),
    taskId: v.id("tasks"),
    fieldId: v.id("customFields"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    value: v.optional(v.any()),
    valueNumeric: v.optional(v.number()),
    valueDate: v.optional(v.number()),
    valueJson: v.optional(v.any()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"]),

  spotCustomFields: defineTable({
    tenantId: v.string(),
    name: v.string(),
    fieldType: v.string(),
    options: v.optional(v.any()),
    validationRules: v.optional(v.any()),
    spotTypeId: v.optional(v.id("spotTypes")),
    isRequired: v.optional(v.boolean()),
    defaultValue: v.optional(v.any()),
  })
    .index("by_tenantId", ["tenantId"]),

  spotCustomFieldValues: defineTable({
    tenantId: v.string(),
    spotId: v.id("spots"),
    fieldId: v.id("spotCustomFields"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    value: v.optional(v.any()),
    valueNumeric: v.optional(v.number()),
    valueDate: v.optional(v.number()),
    valueJson: v.optional(v.any()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_spotId", ["tenantId", "spotId"]),

  // ===========================================================================
  // FORMS
  // ===========================================================================

  forms: defineTable({
    tenantId: v.string(),
    currentVersionId: v.optional(v.string()), // self-referencing cycle, use string
    name: v.string(),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  formFields: defineTable({
    tenantId: v.string(),
    formId: v.id("forms"),
    optionVersionId: v.optional(v.string()),
    name: v.string(),
    type: v.string(),
    position: v.optional(v.number()),
    properties: v.optional(v.any()), // JSON
    isRequired: v.optional(v.boolean()),
    validationRules: v.optional(v.any()), // JSON
    displayRules: v.optional(v.any()), // JSON
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_formId", ["tenantId", "formId"]),

  formVersions: defineTable({
    tenantId: v.string(),
    formId: v.id("forms"),
    version: v.number(),
    fields: v.optional(v.any()), // JSON snapshot
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_formId", ["tenantId", "formId"]),

  taskForms: defineTable({
    tenantId: v.string(),
    taskId: v.id("tasks"),
    formVersionId: v.id("formVersions"),
    data: v.optional(v.any()), // JSON form data
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"]),

  fieldOptions: defineTable({
    tenantId: v.string(),
    name: v.string(),
    version: v.optional(v.number()),
    data: v.optional(v.any()), // JSON
    enabled: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // SLA SYSTEM
  // ===========================================================================

  slas: defineTable({
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    runbook: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    color: v.optional(v.string()),
    responseTimeTarget: v.optional(v.number()),
    responseTime: v.optional(v.number()),
    resolutionTimeTarget: v.optional(v.number()),
    resolutionTime: v.optional(v.number()),
    slaPolicyId: v.optional(v.id("slaPolicies")),
  })
    .index("by_tenantId", ["tenantId"]),

  slaPolicies: defineTable({
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    active: v.optional(v.boolean()),
    triggerType: v.optional(v.string()),
    triggerStatusId: v.optional(v.id("statuses")),
    triggerFieldId: v.optional(v.id("customFields")),
    triggerOperator: v.optional(v.string()),
    triggerValueText: v.optional(v.string()),
    triggerValueNumber: v.optional(v.number()),
    triggerValueBoolean: v.optional(v.boolean()),
    graceSeconds: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"]),

  slaAlerts: defineTable({
    tenantId: v.string(),
    slaId: v.id("slas"),
    time: v.optional(v.number()),
    type: v.optional(v.string()),
    notifyTo: v.optional(v.any()), // JSON
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_slaId", ["tenantId", "slaId"]),

  slaEscalationLevels: defineTable({
    tenantId: v.string(),
    slaId: v.id("slas"),
    phase: v.optional(v.string()),
    level: v.optional(v.number()),
    delaySeconds: v.optional(v.number()),
    action: v.optional(v.string()),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    priorityId: v.optional(v.id("priorities")),
    statusId: v.optional(v.id("statuses")),
    tagId: v.optional(v.id("tags")),
    notifyTo: v.optional(v.any()), // JSON
    instructions: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_slaId", ["tenantId", "slaId"]),

  // ===========================================================================
  // APPROVALS
  // ===========================================================================

  approvals: defineTable({
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    approvalType: v.optional(v.string()),
    requireAll: v.optional(v.boolean()),
    minimumApprovals: v.optional(v.number()),
    triggerType: v.optional(v.string()), // "ON_COMPLETE" | "CONDITIONAL"
    triggerConditions: v.optional(v.any()), // JSON
    requireRejectionComment: v.optional(v.boolean()),
    blockEditingDuringApproval: v.optional(v.boolean()),
    deadlineType: v.optional(v.string()),
    deadlineValue: v.optional(v.number()),
    orderIndex: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    onApprovedActions: v.optional(v.any()), // JSON
    onRejectedActions: v.optional(v.any()), // JSON
    triggerStatusId: v.optional(v.id("statuses")),
  })
    .index("by_tenantId", ["tenantId"]),

  approvalApprovers: defineTable({
    tenantId: v.string(),
    approvalId: v.id("approvals"),
    approverType: v.string(), // "user" | "role" | "team"
    approverId: v.string(), // polymorphic ID
    scope: v.optional(v.string()),
    scopeId: v.optional(v.string()),
    required: v.optional(v.boolean()),
    orderIndex: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_approvalId", ["tenantId", "approvalId"]),

  taskApprovalInstances: defineTable({
    tenantId: v.string(),
    taskId: v.id("tasks"),
    approverUserId: v.id("users"),
    sourceApproverId: v.optional(v.id("approvalApprovers")),
    orderIndex: v.optional(v.number()),
    isRequired: v.optional(v.boolean()),
    status: v.optional(v.string()), // "pending" | "approved" | "rejected"
    notifiedAt: v.optional(v.number()),
    respondedAt: v.optional(v.number()),
    responseComment: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_taskId", ["tenantId", "taskId"]),

  // ===========================================================================
  // ROLES & PERMISSIONS
  // ===========================================================================

  roles: defineTable({
    tenantId: v.string(),
    name: v.string(),
    guardName: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  permissions: defineTable({
    tenantId: v.string(),
    name: v.string(),
    guardName: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  rolePermissions: defineTable({
    tenantId: v.string(),
    roleId: v.id("roles"),
    permissionId: v.id("permissions"),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_roleId", ["tenantId", "roleId"]),

  // ===========================================================================
  // BROADCASTS
  // ===========================================================================

  broadcasts: defineTable({
    tenantId: v.string(),
    title: v.string(),
    message: v.optional(v.string()),
    priority: v.optional(v.string()),
    recipientSelectionType: v.optional(v.string()),
    totalRecipients: v.optional(v.number()),
    totalAcknowledged: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    status: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_tenantId", ["tenantId"]),

  broadcastAcknowledgments: defineTable({
    tenantId: v.string(),
    broadcastId: v.id("broadcasts"),
    userId: v.id("users"),
    status: v.optional(v.string()),
    acknowledgedAt: v.optional(v.number()),
    notifiedAt: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_broadcastId", ["tenantId", "broadcastId"]),

  // ===========================================================================
  // INVITATIONS
  // ===========================================================================

  invitations: defineTable({
    tenantId: v.string(),
    invitationToken: v.string(),
    userEmail: v.string(),
    teamIds: v.optional(v.any()), // JSON array
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_token", ["invitationToken"]),

  // ===========================================================================
  // BOARDS (Communication)
  // ===========================================================================

  boards: defineTable({
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    visibility: v.optional(v.string()),
    birthdayMessagesEnabled: v.optional(v.boolean()),
    birthdayMessageTemplate: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  boardMembers: defineTable({
    tenantId: v.string(),
    boardId: v.id("boards"),
    memberType: v.string(), // "user" | "team"
    memberId: v.string(), // polymorphic
    role: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_boardId", ["tenantId", "boardId"]),

  boardMessages: defineTable({
    tenantId: v.string(),
    boardId: v.id("boards"),
    createdBy: v.optional(v.id("users")),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    isPinned: v.optional(v.boolean()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    metadata: v.optional(v.any()), // JSON
    sourceType: v.optional(v.string()),
    sourceId: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_boardId", ["tenantId", "boardId"]),

  boardAttachments: defineTable({
    tenantId: v.string(),
    uuid: v.optional(v.string()),
    boardMessageId: v.id("boardMessages"),
    type: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    filePath: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileExtension: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_boardMessageId", ["tenantId", "boardMessageId"]),

  boardBirthdayImages: defineTable({
    tenantId: v.string(),
    boardId: v.id("boards"),
    storageId: v.optional(v.id("_storage")),
    filePath: v.optional(v.string()),
    fileName: v.optional(v.string()),
    uploadedBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_boardId", ["tenantId", "boardId"]),

  // ===========================================================================
  // MESSAGES & CHAT
  // ===========================================================================

  messages: defineTable({
    tenantId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    teamId: v.optional(v.id("teams")),
    spotId: v.optional(v.id("spots")),
    createdBy: v.optional(v.id("users")),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    isPinned: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_workspaceId", ["tenantId", "workspaceId"]),

  workspaceChat: defineTable({
    tenantId: v.string(),
    uuid: v.optional(v.string()),
    workspaceId: v.id("workspaces"),
    message: v.string(),
    userId: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_workspaceId", ["tenantId", "workspaceId"]),

  conversations: defineTable({
    tenantId: v.string(),
    uuid: v.optional(v.string()),
    type: v.optional(v.string()), // "direct" | "group"
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    lastMessageAt: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"]),

  conversationParticipants: defineTable({
    tenantId: v.string(),
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    lastReadAt: v.optional(v.number()),
    isMuted: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_conversationId", ["tenantId", "conversationId"])
    .index("by_userId", ["tenantId", "userId"]),

  directMessages: defineTable({
    tenantId: v.string(),
    uuid: v.optional(v.string()),
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    message: v.string(),
    status: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_conversationId", ["tenantId", "conversationId"]),

  messageReactions: defineTable({
    tenantId: v.string(),
    messageId: v.string(), // polymorphic (direct message or workspace chat)
    userId: v.id("users"),
    emoji: v.string(),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_messageId", ["tenantId", "messageId"]),

  linkPreviews: defineTable({
    tenantId: v.string(),
    messageId: v.optional(v.string()),
    workspaceChatId: v.optional(v.string()),
    urlHash: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    siteName: v.optional(v.string()),
    faviconUrl: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // WORKSPACE RESOURCES
  // ===========================================================================

  workspaceResources: defineTable({
    tenantId: v.string(),
    uuid: v.optional(v.string()),
    workspaceId: v.id("workspaces"),
    storageId: v.optional(v.id("_storage")),
    filePath: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileExtension: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    userId: v.optional(v.id("users")),
    folder: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_workspaceId", ["tenantId", "workspaceId"]),

  // ===========================================================================
  // DOCUMENTS
  // ===========================================================================

  documentCategories: defineTable({
    tenantId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    position: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  documents: defineTable({
    tenantId: v.string(),
    uuid: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    title: v.string(),
    description: v.optional(v.string()),
    documentType: v.optional(v.string()),
    documentCategoryId: v.optional(v.id("documentCategories")),
    storageId: v.optional(v.id("_storage")),
    filePath: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileExtension: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    version: v.optional(v.number()),
    isPublic: v.optional(v.boolean()),
    requiresAcknowledgment: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_workspaceId", ["tenantId", "workspaceId"]),

  documentAssociations: defineTable({
    tenantId: v.string(),
    documentId: v.id("documents"),
    associableType: v.string(),
    associableId: v.string(), // polymorphic
    inheritToChildren: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_documentId", ["tenantId", "documentId"]),

  documentAcknowledgments: defineTable({
    tenantId: v.string(),
    documentId: v.id("documents"),
    userId: v.id("users"),
    acknowledgedAt: v.optional(v.number()),
    ipAddress: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_documentId", ["tenantId", "documentId"]),

  // ===========================================================================
  // COMPLIANCE & SOPs
  // ===========================================================================

  complianceStandards: defineTable({
    tenantId: v.string(),
    name: v.string(),
    code: v.optional(v.string()),
    version: v.optional(v.string()),
    description: v.optional(v.string()),
    authority: v.optional(v.string()),
    active: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  complianceRequirements: defineTable({
    tenantId: v.string(),
    standardId: v.id("complianceStandards"),
    clauseNumber: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    implementationGuidance: v.optional(v.string()),
    mandatory: v.optional(v.boolean()),
    parentId: v.optional(v.id("complianceRequirements")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_standardId", ["tenantId", "standardId"]),

  complianceMappings: defineTable({
    tenantId: v.string(),
    requirementId: v.id("complianceRequirements"),
    mappedEntityType: v.string(),
    mappedEntityId: v.string(), // polymorphic
    justification: v.optional(v.string()),
    complianceStatus: v.optional(v.string()),
    notes: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  complianceAudits: defineTable({
    tenantId: v.string(),
    standardId: v.id("complianceStandards"),
    name: v.string(),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    scheduledStartDate: v.optional(v.number()),
    scheduledEndDate: v.optional(v.number()),
    actualStartDate: v.optional(v.number()),
    completedDate: v.optional(v.number()),
    auditorId: v.optional(v.id("users")),
    externalAuditorName: v.optional(v.string()),
    scope: v.optional(v.string()),
    summaryFindings: v.optional(v.string()),
    score: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  sops: defineTable({
    tenantId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    code: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(v.string()),
    currentVersionId: v.optional(v.string()), // self-ref cycle
    approvalId: v.optional(v.id("approvals")),
    documentId: v.optional(v.id("documents")),
    effectiveDate: v.optional(v.number()),
    reviewDate: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  sopSteps: defineTable({
    tenantId: v.string(),
    sopId: v.id("sops"),
    parentId: v.optional(v.id("sopSteps")),
    stepNumber: v.optional(v.number()),
    title: v.string(),
    content: v.optional(v.string()),
    isCritical: v.optional(v.boolean()),
    requiresSignature: v.optional(v.boolean()),
    estimatedDurationMinutes: v.optional(v.number()),
    orderIndex: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_sopId", ["tenantId", "sopId"]),

  sopVersions: defineTable({
    tenantId: v.string(),
    sopId: v.id("sops"),
    versionNumber: v.optional(v.number()),
    changeSummary: v.optional(v.string()),
    status: v.optional(v.string()),
    stepsSnapshot: v.optional(v.any()), // JSON
    submittedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_sopId", ["tenantId", "sopId"]),

  sopExecutions: defineTable({
    tenantId: v.string(),
    sopId: v.id("sops"),
    versionId: v.optional(v.id("sopVersions")),
    executorId: v.optional(v.id("users")),
    status: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    stepCompletions: v.optional(v.any()), // JSON
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  sopAssociations: defineTable({
    tenantId: v.string(),
    sopId: v.id("sops"),
    associatedEntityType: v.string(),
    associatedEntityId: v.string(),
    inheritToChildren: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  sopApprovalInstances: defineTable({
    tenantId: v.string(),
    sopVersionId: v.id("sopVersions"),
    approverUserId: v.id("users"),
    sourceApproverId: v.optional(v.id("approvalApprovers")),
    orderIndex: v.optional(v.number()),
    isRequired: v.optional(v.boolean()),
    status: v.optional(v.string()),
    notifiedAt: v.optional(v.number()),
    respondedAt: v.optional(v.number()),
    responseComment: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  sopApprovalDecisions: defineTable({
    tenantId: v.string(),
    sopVersionId: v.id("sopVersions"),
    approvalId: v.optional(v.id("approvals")),
    approverUserId: v.id("users"),
    decidedByUserId: v.optional(v.id("users")),
    decision: v.string(),
    comment: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // WORKFLOWS
  // ===========================================================================

  workflows: defineTable({
    tenantId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    isActive: v.optional(v.boolean()),
    currentVersionId: v.optional(v.string()), // self-ref cycle
    createdBy: v.optional(v.id("users")),
    updatedBy: v.optional(v.id("users")),
    activatedAt: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // POWERUPS / PLUGINS
  // ===========================================================================

  plugins: defineTable({
    tenantId: v.string(),
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    version: v.optional(v.string()),
    isEnabled: v.optional(v.boolean()),
    settings: v.optional(v.any()), // JSON
    categoryIds: v.optional(v.any()), // JSON array
    requiredPermissions: v.optional(v.any()), // JSON array
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_slug", ["tenantId", "slug"]),

  pluginRoutes: defineTable({
    tenantId: v.string(),
    pluginId: v.id("plugins"),
    method: v.optional(v.string()),
    path: v.optional(v.string()),
    controller: v.optional(v.string()),
    action: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // KPI CARDS & ANALYTICS
  // ===========================================================================

  kpiCards: defineTable({
    tenantId: v.string(),
    name: v.string(),
    type: v.optional(v.string()),
    queryConfig: v.optional(v.any()), // JSON
    displayConfig: v.optional(v.any()), // JSON
    position: v.optional(v.number()),
    isEnabled: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"]),

  reports: defineTable({
    tenantId: v.string(),
    name: v.string(),
    type: v.optional(v.string()),
    visibility: v.optional(v.string()),
    config: v.optional(v.any()), // JSON
    filters: v.optional(v.any()), // JSON
    isTemplate: v.optional(v.boolean()),
    isPinned: v.optional(v.boolean()),
    position: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"]),

  reportSchedules: defineTable({
    tenantId: v.string(),
    reportId: v.id("reports"),
    frequency: v.optional(v.string()),
    sendAt: v.optional(v.string()),
    recipients: v.optional(v.any()), // JSON
    format: v.optional(v.string()),
    includeAiSummary: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"]),

  reportSnapshots: defineTable({
    tenantId: v.string(),
    reportId: v.id("reports"),
    generatedBy: v.optional(v.id("users")),
    fileFormat: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // WORKING HOURS
  // ===========================================================================

  countryConfigs: defineTable({
    tenantId: v.string(),
    countryCode: v.string(),
    countryName: v.string(),
    defaultWeeklyHours: v.optional(v.number()),
    maxDailyHours: v.optional(v.number()),
    minBreakAfterHours: v.optional(v.number()),
    minBreakDurationMinutes: v.optional(v.number()),
    overtimeThresholdDaily: v.optional(v.number()),
    overtimeThresholdWeekly: v.optional(v.number()),
    settings: v.optional(v.any()), // JSON
    isActive: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"]),

  overtimeRules: defineTable({
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
  })
    .index("by_tenantId", ["tenantId"]),

  overtimeMultipliers: defineTable({
    tenantId: v.string(),
    overtimeRuleId: v.id("overtimeRules"),
    multiplierType: v.optional(v.string()),
    thresholdHours: v.optional(v.number()),
    multiplier: v.optional(v.number()),
    priority: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"]),

  holidayCalendars: defineTable({
    tenantId: v.string(),
    name: v.string(),
    countryConfigId: v.optional(v.id("countryConfigs")),
    regionCode: v.optional(v.string()),
    calendarYear: v.optional(v.number()),
    source: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"]),

  holidays: defineTable({
    tenantId: v.string(),
    holidayCalendarId: v.id("holidayCalendars"),
    name: v.string(),
    description: v.optional(v.string()),
    date: v.number(), // epoch ms
    holidayType: v.optional(v.string()),
    isHalfDay: v.optional(v.boolean()),
    isRecurring: v.optional(v.boolean()),
    affectsOvertime: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"]),

  workingSchedules: defineTable({
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
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  scheduleAssignments: defineTable({
    tenantId: v.string(),
    workingScheduleId: v.id("workingSchedules"),
    assignableType: v.string(),
    assignableId: v.string(), // polymorphic
    priority: v.optional(v.number()),
    effectiveFrom: v.optional(v.number()),
    effectiveTo: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"]),

  timeOffTypes: defineTable({
    tenantId: v.string(),
    name: v.string(),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    requiresApproval: v.optional(v.boolean()),
    approvalId: v.optional(v.id("approvals")),
    maxDaysPerYear: v.optional(v.number()),
    isPaid: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"]),

  timeOffRequests: defineTable({
    tenantId: v.string(),
    userId: v.id("users"),
    timeOffTypeId: v.id("timeOffTypes"),
    startDate: v.number(),
    endDate: v.number(),
    startHalfDay: v.optional(v.boolean()),
    endHalfDay: v.optional(v.boolean()),
    totalDays: v.optional(v.number()),
    reason: v.optional(v.string()),
    status: v.optional(v.string()),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_userId", ["tenantId", "userId"]),

  timeOffApprovalInstances: defineTable({
    tenantId: v.string(),
    timeOffRequestId: v.id("timeOffRequests"),
    approvalId: v.optional(v.id("approvals")),
    approverUserId: v.id("users"),
    sourceApproverId: v.optional(v.id("approvalApprovers")),
    orderIndex: v.optional(v.number()),
    isRequired: v.optional(v.boolean()),
    status: v.optional(v.string()),
    notifiedAt: v.optional(v.number()),
    respondedAt: v.optional(v.number()),
    responseComment: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  timeOffApprovalDecisions: defineTable({
    tenantId: v.string(),
    timeOffRequestId: v.id("timeOffRequests"),
    approvalId: v.optional(v.id("approvals")),
    approverUserId: v.id("users"),
    decidedByUserId: v.optional(v.id("users")),
    decision: v.string(),
    comment: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // ASSET MANAGEMENT
  // ===========================================================================

  assetTypes: defineTable({
    tenantId: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  assetItems: defineTable({
    tenantId: v.string(),
    name: v.string(),
    parentId: v.optional(v.id("assetItems")),
    assetTypeId: v.optional(v.id("assetTypes")),
    spotId: v.optional(v.id("spots")),
    serialNumber: v.optional(v.string()),
    model: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    purchaseDate: v.optional(v.number()),
    purchaseCost: v.optional(v.number()),
    warrantyExpiration: v.optional(v.number()),
    status: v.optional(v.string()),
    qrCode: v.optional(v.string()),
    notes: v.optional(v.string()),
    assignedUserId: v.optional(v.id("users")),
    assignedTeamId: v.optional(v.id("teams")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_spotId", ["tenantId", "spotId"]),

  assetMaintenanceSchedules: defineTable({
    tenantId: v.string(),
    assetItemId: v.id("assetItems"),
    title: v.string(),
    description: v.optional(v.string()),
    frequencyValue: v.optional(v.number()),
    frequencyUnit: v.optional(v.string()),
    nextDueDate: v.optional(v.number()),
    lastPerformedAt: v.optional(v.number()),
    workspaceId: v.optional(v.id("workspaces")),
    categoryId: v.optional(v.id("categories")),
    assignedTeamId: v.optional(v.id("teams")),
    isActive: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"]),

  assetMaintenanceLogs: defineTable({
    tenantId: v.string(),
    assetItemId: v.id("assetItems"),
    scheduleId: v.optional(v.id("assetMaintenanceSchedules")),
    taskId: v.optional(v.id("tasks")),
    performedBy: v.optional(v.id("users")),
    performedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    cost: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"]),

  assetCustomFields: defineTable({
    tenantId: v.string(),
    name: v.string(),
    fieldType: v.string(),
    options: v.optional(v.any()),
    validationRules: v.optional(v.any()),
    assetTypeId: v.optional(v.id("assetTypes")),
    isRequired: v.optional(v.boolean()),
    defaultValue: v.optional(v.any()),
    sortOrder: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"]),

  assetCustomFieldValues: defineTable({
    tenantId: v.string(),
    assetItemId: v.id("assetItems"),
    fieldId: v.id("assetCustomFields"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    value: v.optional(v.any()),
    valueNumeric: v.optional(v.number()),
    valueDate: v.optional(v.number()),
    valueJson: v.optional(v.any()),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // COST MANAGEMENT
  // ===========================================================================

  costCategories: defineTable({
    tenantId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    type: v.optional(v.string()),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    parentId: v.optional(v.id("costCategories")),
    isActive: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"]),

  costBudgets: defineTable({
    tenantId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    taskId: v.optional(v.id("tasks")),
    name: v.string(),
    estimatedLabor: v.optional(v.number()),
    estimatedMaterials: v.optional(v.number()),
    estimatedOther: v.optional(v.number()),
    estimatedTotal: v.optional(v.number()),
    contingencyPercent: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  costItems: defineTable({
    tenantId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    taskId: v.optional(v.id("tasks")),
    budgetId: v.optional(v.id("costBudgets")),
    costCategoryId: v.optional(v.id("costCategories")),
    type: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    estimatedAmount: v.optional(v.number()),
    actualAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    workerUserId: v.optional(v.id("users")),
    hourlyRate: v.optional(v.number()),
    hoursWorked: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    overtimeRate: v.optional(v.number()),
    workDate: v.optional(v.number()),
    materialName: v.optional(v.string()),
    unit: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    quantityEstimated: v.optional(v.number()),
    quantityActual: v.optional(v.number()),
    supplierName: v.optional(v.string()),
    date: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // QR CODES
  // ===========================================================================

  qrCodes: defineTable({
    tenantId: v.string(),
    uuid: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    action: v.optional(v.string()),
    contentFormat: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_uuid", ["uuid"]),

  qrScanLogs: defineTable({
    tenantId: v.string(),
    qrCodeId: v.id("qrCodes"),
    userId: v.optional(v.id("users")),
    ipAddress: v.optional(v.string()),
    scannedAt: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // LOGGING & AUDIT
  // ===========================================================================

  sessionLogs: defineTable({
    tenantId: v.string(),
    userId: v.optional(v.id("users")),
    actionType: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    description: v.optional(v.string()),
    deviceData: v.optional(v.any()), // JSON
  })
    .index("by_tenantId", ["tenantId"]),

  configLogs: defineTable({
    tenantId: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    action: v.optional(v.string()),
    oldValues: v.optional(v.any()), // JSON
    newValues: v.optional(v.any()), // JSON
  })
    .index("by_tenantId", ["tenantId"]),

  exceptions: defineTable({
    tenantId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    userId: v.optional(v.id("users")),
    roleId: v.optional(v.id("roles")),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // JOB POSITIONS
  // ===========================================================================

  jobPositions: defineTable({
    tenantId: v.string(),
    code: v.optional(v.string()),
    title: v.string(),
    level: v.optional(v.number()),
    isLeadership: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    description: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"]),

  // ===========================================================================
  // GLOBAL SETTINGS & TRANSLATIONS
  // ===========================================================================

  globalSettings: defineTable({
    tenantId: v.string(),
    key: v.string(),
    value: v.optional(v.any()),
    group: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_key", ["tenantId", "key"]),

  translations: defineTable({
    tenantId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    field: v.string(),
    language: v.string(),
    translatedText: v.optional(v.string()),
    sourceHash: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_entity", ["tenantId", "entityType", "entityId"]),

  // ===========================================================================
  // NOTIFICATIONS (client-managed, persisted in Convex)
  // ===========================================================================

  notifications: defineTable({
    tenantId: v.string(),
    userId: v.id("users"),
    type: v.optional(v.string()),
    title: v.optional(v.string()),
    message: v.optional(v.string()),
    data: v.optional(v.any()), // JSON payload
    readAt: v.optional(v.number()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_userId", ["tenantId", "userId"]),
});
