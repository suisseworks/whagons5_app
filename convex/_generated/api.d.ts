/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _helpers_auth from "../_helpers/auth.js";
import type * as _helpers_tenancy from "../_helpers/tenancy.js";
import type * as analytics from "../analytics.js";
import type * as approvals from "../approvals.js";
import type * as assets from "../assets.js";
import type * as boards from "../boards.js";
import type * as broadcasts from "../broadcasts.js";
import type * as bulk from "../bulk.js";
import type * as categories from "../categories.js";
import type * as chat from "../chat.js";
import type * as compliance from "../compliance.js";
import type * as costs from "../costs.js";
import type * as customFields from "../customFields.js";
import type * as documents from "../documents.js";
import type * as forms from "../forms.js";
import type * as migrations_seedFromPostgres from "../migrations/seedFromPostgres.js";
import type * as priorities from "../priorities.js";
import type * as qrCodes from "../qrCodes.js";
import type * as roles from "../roles.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as sla from "../sla.js";
import type * as sops from "../sops.js";
import type * as spots from "../spots.js";
import type * as statusTransitions from "../statusTransitions.js";
import type * as statuses from "../statuses.js";
import type * as tags from "../tags.js";
import type * as taskResources from "../taskResources.js";
import type * as tasks from "../tasks.js";
import type * as teams from "../teams.js";
import type * as templates from "../templates.js";
import type * as tenants from "../tenants.js";
import type * as timeOff from "../timeOff.js";
import type * as users from "../users.js";
import type * as workingHours from "../workingHours.js";
import type * as workspaceResources from "../workspaceResources.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_helpers/auth": typeof _helpers_auth;
  "_helpers/tenancy": typeof _helpers_tenancy;
  analytics: typeof analytics;
  approvals: typeof approvals;
  assets: typeof assets;
  boards: typeof boards;
  broadcasts: typeof broadcasts;
  bulk: typeof bulk;
  categories: typeof categories;
  chat: typeof chat;
  compliance: typeof compliance;
  costs: typeof costs;
  customFields: typeof customFields;
  documents: typeof documents;
  forms: typeof forms;
  "migrations/seedFromPostgres": typeof migrations_seedFromPostgres;
  priorities: typeof priorities;
  qrCodes: typeof qrCodes;
  roles: typeof roles;
  seed: typeof seed;
  settings: typeof settings;
  sla: typeof sla;
  sops: typeof sops;
  spots: typeof spots;
  statusTransitions: typeof statusTransitions;
  statuses: typeof statuses;
  tags: typeof tags;
  taskResources: typeof taskResources;
  tasks: typeof tasks;
  teams: typeof teams;
  templates: typeof templates;
  tenants: typeof tenants;
  timeOff: typeof timeOff;
  users: typeof users;
  workingHours: typeof workingHours;
  workspaceResources: typeof workspaceResources;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
