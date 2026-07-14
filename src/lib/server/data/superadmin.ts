/**
 * Superadmin data-access — cross-tenant governance of users, companies,
 * roles/permissions and module licensing. Every function runs inside
 * `withSuperadmin` (user GUC only; superadmin_all RLS policies grant full
 * cross-company visibility). Raw SQL throughout — the composite-keyed grant
 * table and cross-tenant reads are clearer than the generated relation names.
 */
import type { TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/auth";
import { withSuperadmin } from "@/lib/server/superadmin";
import { ALL_PERMISSIONS, isValidPermission } from "@/lib/permissions";
import { MODULE_IDS, type ModuleId, type ModuleMap } from "@/lib/server/data/modules";

// ── Shapes returned to the client ────────────────────────────────────────────
export interface Membership {
  id: string;
  companyId: string;
  companyName: string;
  companyCode: string;
  roleId: string | null;
  roleName: string | null;
  status: string;
  isDefault: boolean;
}
export interface UserRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  isSuperadmin: boolean;
  createdAt: string;
  memberships: Membership[];
}
export interface CompanyRow {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  memberCount: number;
  roleCount: number;
  modules: ModuleMap;
}
export interface RoleRow {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  memberCount: number;
  permissions: string[];
}
export interface Overview {
  users: UserRow[];
  companies: CompanyRow[];
  roles: RoleRow[];
}

const moduleMap = (rows: { module_id: string; enabled: boolean }[]): ModuleMap => {
  const map = Object.fromEntries(MODULE_IDS.map((id) => [id, true])) as ModuleMap;
  for (const r of rows) {
    if ((MODULE_IDS as readonly string[]).includes(r.module_id)) map[r.module_id as ModuleId] = r.enabled;
  }
  return map;
};

// ── Reads ─────────────────────────────────────────────────────────────────────

async function readUsers(tx: TxClient): Promise<UserRow[]> {
  const users = await tx.$queryRaw<
    { id: string; name: string; email: string; is_active: boolean; is_superadmin: boolean; created_at: Date }[]
  >`SELECT id, name, email, is_active, is_superadmin, created_at
      FROM users WHERE deleted_at IS NULL ORDER BY created_at`;
  const mems = await tx.$queryRaw<
    {
      id: string; user_id: string; company_id: string; company_name: string; company_code: string;
      role_id: string | null; role_name: string | null; status: string; is_default: boolean;
    }[]
  >`SELECT m.id, m.user_id, m.company_id, c.name AS company_name, c.code AS company_code,
           m.role_id, r.name AS role_name, m.status::text AS status, m.is_default
      FROM company_memberships m
      JOIN companies c ON c.id = m.company_id
      LEFT JOIN roles r ON r.id = m.role_id
     WHERE m.deleted_at IS NULL
     ORDER BY c.name`;
  const byUser = new Map<string, Membership[]>();
  for (const m of mems) {
    const list = byUser.get(m.user_id) ?? [];
    list.push({
      id: m.id, companyId: m.company_id, companyName: m.company_name, companyCode: m.company_code,
      roleId: m.role_id, roleName: m.role_name, status: m.status, isDefault: m.is_default,
    });
    byUser.set(m.user_id, list);
  }
  return users.map((u) => ({
    id: u.id, name: u.name, email: u.email, isActive: u.is_active, isSuperadmin: u.is_superadmin,
    createdAt: u.created_at.toISOString(), memberships: byUser.get(u.id) ?? [],
  }));
}

async function readCompanies(tx: TxClient): Promise<CompanyRow[]> {
  const rows = await tx.$queryRaw<
    { id: string; code: string; name: string; created_at: Date; member_count: number; role_count: number }[]
  >`SELECT c.id, c.code, c.name, c.created_at,
      (SELECT count(*)::int FROM company_memberships m WHERE m.company_id = c.id AND m.deleted_at IS NULL) AS member_count,
      (SELECT count(*)::int FROM roles r WHERE r.company_id = c.id AND r.deleted_at IS NULL) AS role_count
      FROM companies c WHERE c.deleted_at IS NULL ORDER BY c.created_at`;
  const mods = await tx.$queryRaw<{ company_id: string; module_id: string; enabled: boolean }[]>`
    SELECT company_id, module_id, enabled FROM company_modules WHERE deleted_at IS NULL`;
  const byCompany = new Map<string, { module_id: string; enabled: boolean }[]>();
  for (const m of mods) {
    const l = byCompany.get(m.company_id) ?? [];
    l.push(m);
    byCompany.set(m.company_id, l);
  }
  return rows.map((c) => ({
    id: c.id, code: c.code, name: c.name, createdAt: c.created_at.toISOString(),
    memberCount: c.member_count, roleCount: c.role_count, modules: moduleMap(byCompany.get(c.id) ?? []),
  }));
}

async function readRoles(tx: TxClient): Promise<RoleRow[]> {
  const roles = await tx.$queryRaw<
    { id: string; company_id: string; name: string; description: string | null; member_count: number }[]
  >`SELECT r.id, r.company_id, r.name, r.description,
      (SELECT count(*)::int FROM company_memberships m WHERE m.role_id = r.id AND m.deleted_at IS NULL) AS member_count
      FROM roles r WHERE r.deleted_at IS NULL ORDER BY r.name`;
  const perms = await tx.$queryRaw<{ role_id: string; resource: string; action: string }[]>`
    SELECT role_id, resource, action::text AS action FROM role_permissions`;
  const byRole = new Map<string, string[]>();
  for (const p of perms) {
    const l = byRole.get(p.role_id) ?? [];
    l.push(`${p.resource}.${p.action}`);
    byRole.set(p.role_id, l);
  }
  return roles.map((r) => ({
    id: r.id, companyId: r.company_id, name: r.name, description: r.description,
    memberCount: r.member_count, permissions: (byRole.get(r.id) ?? []).sort(),
  }));
}

/** Everything the console needs in one round-trip. */
export function getOverview(): Promise<Overview> {
  return withSuperadmin(async (tx) => ({
    users: await readUsers(tx),
    companies: await readCompanies(tx),
    roles: await readRoles(tx),
  }));
}

// ── Users ───────────────────────────────────────────────────────────────────

export interface CreateUserInput {
  name: string;
  email: string;
  password?: string | null;
  isActive?: boolean;
  isSuperadmin?: boolean;
}
export function createUser(input: CreateUserInput): Promise<UserRow> {
  return withSuperadmin(async (tx, ctx) => {
    const dup = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE lower(email) = lower(${input.email}) AND deleted_at IS NULL LIMIT 1`;
    if (dup.length) throw Errors.conflict("A user with this email already exists");
    const hash = input.password ? await hashPassword(input.password) : null;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO users (name, email, password_hash, is_active, is_superadmin, created_by, updated_by)
      VALUES (${input.name}, ${input.email}, ${hash}, ${input.isActive ?? true}, ${input.isSuperadmin ?? false},
              ${ctx.userId}::uuid, ${ctx.userId}::uuid)
      RETURNING id`;
    const users = await readUsers(tx);
    return users.find((u) => u.id === rows[0].id)!;
  });
}

export interface UpdateUserInput {
  name?: string;
  isActive?: boolean;
  isSuperadmin?: boolean;
  /** When set, resets the user's password (no current-password check — superadmin override). */
  password?: string;
}
export function updateUser(id: string, input: UpdateUserInput): Promise<UserRow> {
  return withSuperadmin(async (tx, ctx) => {
    const existing = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${id}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (!existing.length) throw Errors.notFound("User");
    // Guard against self-lockout: a superadmin can't demote or deactivate themselves.
    if (id === ctx.userId && (input.isSuperadmin === false || input.isActive === false)) {
      throw Errors.badRequest("You cannot revoke your own superadmin access or deactivate yourself");
    }
    const passwordHash = input.password ? await hashPassword(input.password) : null;
    await tx.$executeRaw`
      UPDATE users SET
        name          = COALESCE(${input.name ?? null}, name),
        is_active     = COALESCE(${input.isActive ?? null}, is_active),
        is_superadmin = COALESCE(${input.isSuperadmin ?? null}, is_superadmin),
        password_hash = COALESCE(${passwordHash}, password_hash),
        updated_by    = ${ctx.userId}::uuid,
        updated_at    = now()
      WHERE id = ${id}::uuid`;
    const users = await readUsers(tx);
    return users.find((u) => u.id === id)!;
  });
}

// ── Memberships (user ↔ company + role) ───────────────────────────────────────

export interface AddMembershipInput {
  companyId: string;
  roleId?: string | null;
  isDefault?: boolean;
}
export function addMembership(userId: string, input: AddMembershipInput): Promise<UserRow> {
  return withSuperadmin(async (tx, ctx) => {
    if (input.roleId) await assertRoleInCompany(tx, input.roleId, input.companyId);
    const dup = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM company_memberships
       WHERE company_id = ${input.companyId}::uuid AND user_id = ${userId}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (dup.length) throw Errors.conflict("User is already a member of this company");
    if (input.isDefault) await clearDefault(tx, userId);
    await tx.$executeRaw`
      INSERT INTO company_memberships (company_id, user_id, role_id, is_default, status, created_by, updated_by)
      VALUES (${input.companyId}::uuid, ${userId}::uuid, ${input.roleId ?? null},
              ${input.isDefault ?? false}, 'active', ${ctx.userId}::uuid, ${ctx.userId}::uuid)`;
    const users = await readUsers(tx);
    return users.find((u) => u.id === userId)!;
  });
}

export interface UpdateMembershipInput {
  roleId?: string | null;
  status?: "active" | "invited" | "suspended";
  isDefault?: boolean;
}
export function updateMembership(id: string, input: UpdateMembershipInput): Promise<UserRow> {
  return withSuperadmin(async (tx, ctx) => {
    const rows = await tx.$queryRaw<{ user_id: string; company_id: string }[]>`
      SELECT user_id, company_id FROM company_memberships WHERE id = ${id}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (!rows.length) throw Errors.notFound("Membership");
    const { user_id, company_id } = rows[0];
    if (input.roleId) await assertRoleInCompany(tx, input.roleId, company_id);
    if (input.isDefault) await clearDefault(tx, user_id);
    await tx.$executeRaw`
      UPDATE company_memberships SET
        role_id    = COALESCE(${input.roleId ?? null}, role_id),
        status     = COALESCE(${input.status ?? null}::membership_status, status),
        is_default = COALESCE(${input.isDefault ?? null}, is_default),
        updated_by = ${ctx.userId}::uuid,
        updated_at = now()
      WHERE id = ${id}::uuid`;
    const users = await readUsers(tx);
    return users.find((u) => u.id === user_id)!;
  });
}

export function removeMembership(id: string): Promise<UserRow | null> {
  return withSuperadmin(async (tx, ctx) => {
    const rows = await tx.$queryRaw<{ user_id: string }[]>`
      SELECT user_id FROM company_memberships WHERE id = ${id}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (!rows.length) throw Errors.notFound("Membership");
    await tx.$executeRaw`
      UPDATE company_memberships SET deleted_at = now(), updated_by = ${ctx.userId}::uuid, updated_at = now()
      WHERE id = ${id}::uuid`;
    const users = await readUsers(tx);
    return users.find((u) => u.id === rows[0].user_id) ?? null;
  });
}

async function assertRoleInCompany(tx: TxClient, roleId: string, companyId: string): Promise<void> {
  const r = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM roles WHERE id = ${roleId}::uuid AND company_id = ${companyId}::uuid AND deleted_at IS NULL LIMIT 1`;
  if (!r.length) throw Errors.badRequest("Role does not belong to that company");
}
async function clearDefault(tx: TxClient, userId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE company_memberships SET is_default = false
    WHERE user_id = ${userId}::uuid AND is_default = true AND deleted_at IS NULL`;
}

// ── Companies ─────────────────────────────────────────────────────────────────

export interface CreateCompanyInput {
  code: string;
  name: string;
}
export function createCompany(input: CreateCompanyInput): Promise<CompanyRow> {
  return withSuperadmin(async (tx, ctx) => {
    const dup = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM companies WHERE lower(code) = lower(${input.code}) AND deleted_at IS NULL LIMIT 1`;
    if (dup.length) throw Errors.conflict("A company with this code already exists");
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO companies (code, name, created_by, updated_by)
      VALUES (${input.code}, ${input.name}, ${ctx.userId}::uuid, ${ctx.userId}::uuid)
      RETURNING id`;
    const companyId = rows[0].id;
    // Seed an Admin role granting the whole permission matrix, so the tenant is
    // immediately administrable and there is a role to assign members to.
    const roleRows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO roles (company_id, name, description, created_by, updated_by)
      VALUES (${companyId}::uuid, 'Admin', 'Full access to the tenant', ${ctx.userId}::uuid, ${ctx.userId}::uuid)
      RETURNING id`;
    await grantPermissions(tx, companyId, roleRows[0].id, ALL_PERMISSIONS, ctx.userId);
    const companies = await readCompanies(tx);
    return companies.find((c) => c.id === companyId)!;
  });
}

export interface UpdateCompanyInput {
  code?: string;
  name?: string;
}
export function updateCompany(id: string, input: UpdateCompanyInput): Promise<CompanyRow> {
  return withSuperadmin(async (tx, ctx) => {
    const existing = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM companies WHERE id = ${id}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (!existing.length) throw Errors.notFound("Company");
    if (input.code) {
      const dup = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM companies WHERE lower(code) = lower(${input.code}) AND id <> ${id}::uuid AND deleted_at IS NULL LIMIT 1`;
      if (dup.length) throw Errors.conflict("A company with this code already exists");
    }
    await tx.$executeRaw`
      UPDATE companies SET
        code = COALESCE(${input.code ?? null}, code),
        name = COALESCE(${input.name ?? null}, name),
        updated_by = ${ctx.userId}::uuid, updated_at = now()
      WHERE id = ${id}::uuid`;
    const companies = await readCompanies(tx);
    return companies.find((c) => c.id === id)!;
  });
}

/** Toggle one module for a specific company (upsert). Returns that company's map. */
export function setCompanyModule(companyId: string, moduleId: ModuleId, enabled: boolean): Promise<ModuleMap> {
  return withSuperadmin(async (tx, ctx) => {
    const exists = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM companies WHERE id = ${companyId}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (!exists.length) throw Errors.notFound("Company");
    await tx.$executeRaw`
      INSERT INTO company_modules (company_id, created_by, updated_by, module_id, enabled)
      VALUES (${companyId}::uuid, ${ctx.userId}::uuid, ${ctx.userId}::uuid, ${moduleId}, ${enabled})
      ON CONFLICT (company_id, module_id) WHERE deleted_at IS NULL
      DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    const rows = await tx.$queryRaw<{ module_id: string; enabled: boolean }[]>`
      SELECT module_id, enabled FROM company_modules WHERE company_id = ${companyId}::uuid AND deleted_at IS NULL`;
    return moduleMap(rows);
  });
}

// ── Roles & permissions ───────────────────────────────────────────────────────

export interface CreateRoleInput {
  companyId: string;
  name: string;
  description?: string | null;
  permissions?: string[];
}
export function createRole(input: CreateRoleInput): Promise<RoleRow> {
  return withSuperadmin(async (tx, ctx) => {
    const company = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM companies WHERE id = ${input.companyId}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (!company.length) throw Errors.badRequest("Unknown company");
    const dup = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM roles WHERE company_id = ${input.companyId}::uuid AND lower(name) = lower(${input.name}) AND deleted_at IS NULL LIMIT 1`;
    if (dup.length) throw Errors.conflict("A role with this name already exists in that company");
    const perms = validatePermissions(input.permissions ?? []);
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO roles (company_id, name, description, created_by, updated_by)
      VALUES (${input.companyId}::uuid, ${input.name}, ${input.description ?? null}, ${ctx.userId}::uuid, ${ctx.userId}::uuid)
      RETURNING id`;
    await grantPermissions(tx, input.companyId, rows[0].id, perms, ctx.userId);
    const roles = await readRoles(tx);
    return roles.find((r) => r.id === rows[0].id)!;
  });
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
}
export function updateRole(id: string, input: UpdateRoleInput): Promise<RoleRow> {
  return withSuperadmin(async (tx, ctx) => {
    const rows = await tx.$queryRaw<{ company_id: string }[]>`
      SELECT company_id FROM roles WHERE id = ${id}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (!rows.length) throw Errors.notFound("Role");
    if (input.name) {
      const dup = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM roles WHERE company_id = ${rows[0].company_id}::uuid AND lower(name) = lower(${input.name})
          AND id <> ${id}::uuid AND deleted_at IS NULL LIMIT 1`;
      if (dup.length) throw Errors.conflict("A role with this name already exists in that company");
    }
    await tx.$executeRaw`
      UPDATE roles SET
        name = COALESCE(${input.name ?? null}, name),
        description = COALESCE(${input.description ?? null}, description),
        updated_by = ${ctx.userId}::uuid, updated_at = now()
      WHERE id = ${id}::uuid`;
    const roles = await readRoles(tx);
    return roles.find((r) => r.id === id)!;
  });
}

/** Replace a role's grants with exactly `permissions`. */
export function setRolePermissions(id: string, permissions: string[]): Promise<RoleRow> {
  return withSuperadmin(async (tx, ctx) => {
    const rows = await tx.$queryRaw<{ company_id: string }[]>`
      SELECT company_id FROM roles WHERE id = ${id}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (!rows.length) throw Errors.notFound("Role");
    const perms = validatePermissions(permissions);
    await tx.$executeRaw`DELETE FROM role_permissions WHERE role_id = ${id}::uuid`;
    await grantPermissions(tx, rows[0].company_id, id, perms, ctx.userId);
    const roles = await readRoles(tx);
    return roles.find((r) => r.id === id)!;
  });
}

export function deleteRole(id: string): Promise<void> {
  return withSuperadmin(async (tx, ctx) => {
    const rows = await tx.$queryRaw<{ member_count: number }[]>`
      SELECT (SELECT count(*)::int FROM company_memberships m WHERE m.role_id = ${id}::uuid AND m.deleted_at IS NULL) AS member_count
      FROM roles WHERE id = ${id}::uuid AND deleted_at IS NULL`;
    if (!rows.length) throw Errors.notFound("Role");
    if (rows[0].member_count > 0) throw Errors.conflict("Reassign its members before deleting this role");
    await tx.$executeRaw`DELETE FROM role_permissions WHERE role_id = ${id}::uuid`;
    await tx.$executeRaw`
      UPDATE roles SET deleted_at = now(), updated_by = ${ctx.userId}::uuid, updated_at = now()
      WHERE id = ${id}::uuid`;
  });
}

function validatePermissions(permissions: string[]): string[] {
  const unique = [...new Set(permissions)];
  const invalid = unique.filter((p) => !isValidPermission(p));
  if (invalid.length) throw Errors.badRequest(`Invalid permissions: ${invalid.join(", ")}`);
  return unique;
}
async function grantPermissions(
  tx: TxClient, companyId: string, roleId: string, permissions: string[], actorId: string,
): Promise<void> {
  for (const perm of permissions) {
    const [resource, action] = perm.split(".");
    await tx.$executeRaw`
      INSERT INTO role_permissions (company_id, role_id, resource, action, created_by)
      VALUES (${companyId}::uuid, ${roleId}::uuid, ${resource}, ${action}::permission_action, ${actorId}::uuid)
      ON CONFLICT DO NOTHING`;
  }
}
