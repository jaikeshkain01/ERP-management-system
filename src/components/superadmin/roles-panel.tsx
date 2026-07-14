"use client"

import * as React from "react"
import { Shield, Plus, Pencil, Trash2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  sa, Modal, Field, ErrorNote, Select, Badge, StatTile,
  type Overview, type RoleRow,
} from "@/components/superadmin/shared"

export function RolesPanel({ data, reload }: { data: Overview; reload: () => Promise<void> }) {
  const [companyId, setCompanyId] = React.useState(data.companies[0]?.id ?? "")
  const [creating, setCreating] = React.useState(false)

  const roles = data.roles.filter((r) => r.companyId === companyId)
  const company = data.companies.find((c) => c.id === companyId)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Roles (this company)" value={roles.length} tone="primary" />
        <StatTile label="Permission types" value={data.allPermissions.length} />
        <StatTile label="Resources" value={Object.keys(data.permissionMatrix).length} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Company</span>
          <Select className="w-56" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </Select>
        </div>
        <Button size="sm" className="gap-1.5 font-semibold" onClick={() => setCreating(true)} disabled={!companyId}>
          <Plus className="h-4 w-4" /> New Role
        </Button>
      </div>

      <div className="space-y-3">
        {roles.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No roles in this company yet.
          </p>
        )}
        {roles.map((r) => <RoleCard key={r.id} role={r} data={data} reload={reload} />)}
      </div>

      {creating && company && (
        <RoleModal companyId={companyId} reload={reload} onClose={() => setCreating(false)} />
      )}
    </div>
  )
}

function RoleCard({ role, data, reload }: { role: RoleRow; data: Overview; reload: () => Promise<void> }) {
  const [draft, setDraft] = React.useState<Set<string>>(() => new Set(role.permissions))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)

  // Re-sync when the underlying role changes (e.g. after a save + reload). Adjusting
  // state during render (the React-recommended pattern) instead of in an effect:
  // role.permissions is a fresh array after each fetch, stable while editing locally.
  const [prevPerms, setPrevPerms] = React.useState(role.permissions)
  if (prevPerms !== role.permissions) {
    setPrevPerms(role.permissions)
    setDraft(new Set(role.permissions))
  }

  const dirty = React.useMemo(() => {
    if (draft.size !== role.permissions.length) return true
    return role.permissions.some((p) => !draft.has(p))
  }, [draft, role.permissions])

  const toggle = (perm: string) =>
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(perm)) next.delete(perm); else next.add(perm)
      return next
    })

  const save = async () => {
    setBusy(true); setError(null)
    try {
      await sa.put(`/api/superadmin/roles/${role.id}/permissions`, { permissions: [...draft] })
      await reload()
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save grants") }
    finally { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true); setError(null)
    try { await sa.del(`/api/superadmin/roles/${role.id}`); await reload() }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to delete role"); setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Shield className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">{role.name}</p>
          {role.description && <p className="truncate text-xs text-muted-foreground">{role.description}</p>}
        </div>
        <Badge tone="muted">{role.memberCount} member{role.memberCount !== 1 ? "s" : ""}</Badge>
        <Badge tone="primary">{draft.size} grant{draft.size !== 1 ? "s" : ""}</Badge>
        <button onClick={() => setEditing(true)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Rename role">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={remove}
          disabled={busy || role.memberCount > 0}
          title={role.memberCount > 0 ? "Reassign members before deleting" : "Delete role"}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2 p-4">
        {Object.entries(data.permissionMatrix).map(([resource, actions]) => (
          <div key={resource} className="flex flex-wrap items-center gap-2">
            <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">{resource}</span>
            <div className="flex flex-wrap gap-1.5">
              {actions.map((action) => {
                const perm = `${resource}.${action}`
                const on = draft.has(perm)
                return (
                  <button
                    key={perm}
                    onClick={() => toggle(perm)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                      on
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {on && <Check className="h-3 w-3" />}
                    {action}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <ErrorNote message={error} />
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[11px] font-medium text-amber-500">Unsaved changes</span>}
          <Button size="sm" variant="outline" onClick={() => setDraft(new Set(role.permissions))} disabled={!dirty || busy}>Reset</Button>
          <Button size="sm" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save grants"}</Button>
        </div>
      </div>

      {editing && <RenameRoleModal role={role} reload={reload} onClose={() => setEditing(false)} />}
    </div>
  )
}

function RenameRoleModal({ role, reload, onClose }: { role: RoleRow; reload: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = React.useState(role.name)
  const [description, setDescription] = React.useState(role.description ?? "")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const submit = async () => {
    if (!name.trim()) return setError("Role name is required.")
    setSaving(true); setError(null)
    try {
      await sa.patch(`/api/superadmin/roles/${role.id}`, { name: name.trim(), description: description.trim() || null })
      await reload()
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to update role"); setSaving(false) }
  }

  return (
    <Modal title={`Edit ${role.name}`} description="Rename or re-describe this role." icon={Pencil} onClose={onClose}
      footer={<>
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </>}>
      <Field label="Role Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <ErrorNote message={error} />
    </Modal>
  )
}

function RoleModal({ companyId, reload, onClose }: { companyId: string; reload: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const submit = async () => {
    if (!name.trim()) return setError("Role name is required.")
    setSaving(true); setError(null)
    try {
      await sa.post("/api/superadmin/roles", { companyId, name: name.trim(), description: description.trim() || null })
      await reload()
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create role"); setSaving(false) }
  }

  return (
    <Modal title="New Role" description="Create an empty role, then grant permissions on its card." icon={Shield} onClose={onClose}
      footer={<>
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create Role"}</Button>
      </>}>
      <Field label="Role Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warehouse Operator" /></Field>
      <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description of the role" /></Field>
      <ErrorNote message={error} />
    </Modal>
  )
}
