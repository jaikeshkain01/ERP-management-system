/**
 * Permission matrix (resource × action) — the app constant from ARCHITECTURE.md §7h.
 *
 * There is intentionally NO permissions catalog table in the DB. A role's grants live
 * on `role_permissions(resource, action)`; the set of *valid* combinations is defined
 * here and mirrors the Admin grant seeded in docs/schema.sql.
 *
 * A permission string is `"<resource>.<action>"`, e.g. `"component.view"`.
 */

export const PERMISSION_ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

const CRUD = ["view", "create", "edit", "delete"] as const;

/** resource → the actions that are meaningful for it. Keep in sync with schema.sql seed. */
export const PERMISSION_MATRIX = {
  product: CRUD,
  pcb: CRUD,
  component: CRUD,
  // F5.2: `item.*` guards the universal-item API (see items.ts). Every role
  // that had a matching `component.*` grant was mirrored at migration time,
  // so no role loses access when items.ts flips its guards over.
  item: CRUD,
  brand: CRUD,
  supplier: CRUD,
  warehouse: CRUD,
  purchase_request: [...CRUD, "approve"],
  purchase_order: [...CRUD, "approve"],
  production_order: [...CRUD, "approve"],
  report: ["view", "export"],
  inventory: ["view", "create", "edit"],
  role: CRUD,
} as const satisfies Record<string, readonly PermissionAction[]>;

export type PermissionResource = keyof typeof PERMISSION_MATRIX;

/** All valid `"resource.action"` strings, flattened. */
export const ALL_PERMISSIONS: string[] = Object.entries(PERMISSION_MATRIX).flatMap(
  ([resource, actions]) => actions.map((a) => `${resource}.${a}`),
);

const PERMISSION_SET = new Set(ALL_PERMISSIONS);

/** True if `perm` is a `"resource.action"` combination that exists in the matrix. */
export function isValidPermission(perm: string): boolean {
  return PERMISSION_SET.has(perm);
}

/** Shape returned by GET /permissions — the matrix as a plain object. */
export function permissionMatrix(): Record<string, readonly string[]> {
  return PERMISSION_MATRIX;
}
