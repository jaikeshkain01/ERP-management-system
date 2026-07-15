"use client"

import * as React from "react"
import { UserPlus, ShieldCheck, Settings2, Star, Trash2, Building2, Plus, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  sa, Modal, Field, ErrorNote, Select, Badge, StatTile,
  type Overview, type UserRow,
} from "@/components/superadmin/shared"
import { useData } from "@/lib/data-provider"

export function UsersPanel({ data, reload }: { data: Overview; reload: () => Promise<void> }) {
  const { me } = useData()
  const [creating, setCreating] = React.useState(false)
  const [managing, setManaging] = React.useState<UserRow | null>(null)

  // Keep the managed user in sync with fresh data after a reload.
  const managed = managing ? data.users.find((u) => u.id === managing.id) ?? null : null

  // A superadmin manages OTHER users — hide their own account (they manage it via
  // Settings). Stat tiles stay platform-wide (they include everyone, incl. you).
  const others = data.users.filter((u) => u.id !== me?.user.id)

  const total = data.users.length
  const active = data.users.filter((u) => u.isActive).length
  const supers = data.users.filter((u) => u.isSuperadmin).length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Users" value={total} tone="primary" />
        <StatTile label="Active" value={active} />
        <StatTile label="Superadmins" value={supers} />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Other users</p>
          <p className="text-xs text-muted-foreground">Everyone except you — manage your own account in Settings.</p>
        </div>
        <Button size="sm" className="gap-1.5 font-semibold" onClick={() => setCreating(true)}>
          <UserPlus className="h-4 w-4" /> New User
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-bold">User</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
              <th className="px-4 py-2.5 font-bold">Memberships</th>
              <th className="px-4 py-2.5 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {others.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No other users yet. Add one with “New User”.
                </td>
              </tr>
            )}
            {others.map((u) => (
              <tr key={u.id} className="hover:bg-muted/10">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{u.name}</span>
                    {u.isSuperadmin && (
                      <Badge tone="primary"><ShieldCheck className="h-3 w-3" /> Super</Badge>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{u.email}</span>
                </td>
                <td className="px-4 py-3">
                  {u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.memberships.length === 0 && <span className="text-xs text-muted-foreground/70">—</span>}
                    {u.memberships.map((m) => (
                      <span key={m.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]">
                        {m.isDefault && <Star className="h-3 w-3 text-amber-500" />}
                        <span className="font-medium">{m.companyCode}</span>
                        <span className="text-muted-foreground">· {m.roleName ?? "no role"}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setManaging(u)}>
                    <Settings2 className="h-3.5 w-3.5" /> Manage
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && <CreateUserModal data={data} reload={reload} onClose={() => setCreating(false)} />}
      {managed && <ManageUserModal user={managed} data={data} reload={reload} onClose={() => setManaging(null)} />}
    </div>
  )
}

function CreateUserModal({ data, reload, onClose }: { data: Overview; reload: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [isSuperadmin, setSuper] = React.useState(false)
  const [companyId, setCompanyId] = React.useState("")
  const [roleId, setRoleId] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const rolesForCompany = data.roles.filter((r) => r.companyId === companyId)

  const submit = async () => {
    if (!name.trim() || !email.trim()) return setError("Name and email are required.")
    setSaving(true)
    setError(null)
    try {
      const user = await sa.post<UserRow>("/api/superadmin/users", {
        name: name.trim(),
        email: email.trim(),
        password: password.trim() || undefined,
        isSuperadmin,
      })
      if (companyId) {
        await sa.post(`/api/superadmin/users/${user.id}/memberships`, {
          companyId,
          roleId: roleId || null,
          isDefault: true,
        })
      }
      await reload()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user")
      setSaving(false)
    }
  }

  return (
    <Modal
      title="New User"
      description="Create a global identity and optionally place them in a company."
      icon={UserPlus}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create User"}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></Field>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" /></Field>
        <Field label="Password" hint="Set one now, or the user can't sign in until you set it via Manage → Reset password."><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" /></Field>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={isSuperadmin} onCheckedChange={setSuper} />
          <span className="text-sm font-medium">Platform superadmin</span>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Initial membership (optional)</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company">
            <Select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setRoleId("") }}>
              <option value="">— None —</option>
              {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </Select>
          </Field>
          <Field label="Role">
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={!companyId}>
              <option value="">— No role —</option>
              {rolesForCompany.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        </div>
      </div>
      <ErrorNote message={error} />
    </Modal>
  )
}

function ManageUserModal({ user, data, reload, onClose }: { user: UserRow; data: Overview; reload: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = React.useState(user.name)
  const [isActive, setActive] = React.useState(user.isActive)
  const [isSuperadmin, setSuper] = React.useState(user.isSuperadmin)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [pw, setPw] = React.useState("")
  const [pwMsg, setPwMsg] = React.useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await fn(); await reload() }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed") }
    finally { setBusy(false) }
  }

  const saveProfile = () => run(() =>
    sa.patch(`/api/superadmin/users/${user.id}`, { name: name.trim(), isActive, isSuperadmin }))

  const resetPassword = async () => {
    if (pw.length < 8) { setPwMsg(null); setError("New password must be at least 8 characters."); return }
    setBusy(true); setError(null); setPwMsg(null)
    try {
      await sa.patch(`/api/superadmin/users/${user.id}`, { password: pw })
      setPw(""); setPwMsg("Password updated.")
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to reset password") }
    finally { setBusy(false) }
  }

  // Companies the user is not yet a member of, for the "add" picker.
  const joinable = data.companies.filter((c) => !user.memberships.some((m) => m.companyId === c.id))
  const [addCompany, setAddCompany] = React.useState("")
  const [addRole, setAddRole] = React.useState("")
  const rolesForAdd = data.roles.filter((r) => r.companyId === addCompany)

  const addMembership = () => {
    if (!addCompany) return
    run(() => sa.post(`/api/superadmin/users/${user.id}/memberships`, { companyId: addCompany, roleId: addRole || null }))
      .then(() => { setAddCompany(""); setAddRole("") })
  }

  return (
    <Modal title={`Manage ${user.name}`} description={user.email} icon={Settings2} onClose={onClose} wide
      footer={<Button size="sm" variant="outline" onClick={onClose}>Done</Button>}>
      {/* Profile */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Profile</p>
        <Field label="Full Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2.5"><Switch checked={isActive} onCheckedChange={setActive} /><span className="text-sm font-medium">Active</span></label>
          <label className="flex items-center gap-2.5"><Switch checked={isSuperadmin} onCheckedChange={setSuper} /><span className="text-sm font-medium">Superadmin</span></label>
          <Button size="sm" className="ml-auto" onClick={saveProfile} disabled={busy}>Save profile</Button>
        </div>
      </div>

      {/* Password reset */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Reset password</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Field label="New password" hint="At least 8 characters. The user isn't asked for their old one.">
              <Input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setPwMsg(null) }} placeholder="••••••••" autoComplete="new-password" />
            </Field>
          </div>
          <Button size="sm" onClick={resetPassword} disabled={busy || pw.length < 8}>Set password</Button>
        </div>
        {pwMsg && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{pwMsg}</p>}
      </div>

      {/* Memberships */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Company memberships</p>
        <div className="space-y-2">
          {user.memberships.length === 0 && <p className="text-xs text-muted-foreground/70">Not a member of any company.</p>}
          {user.memberships.map((m) => {
            const roles = data.roles.filter((r) => r.companyId === m.companyId)
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/10 px-3 py-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="min-w-[120px] flex-1 text-sm font-medium">{m.companyName}</span>
                <Select className="w-36" value={m.roleId ?? ""} onChange={(e) => run(() => sa.patch(`/api/superadmin/memberships/${m.id}`, { roleId: e.target.value || null }))}>
                  <option value="">No role</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
                <Select className="w-28" value={m.status} onChange={(e) => run(() => sa.patch(`/api/superadmin/memberships/${m.id}`, { status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="invited">Invited</option>
                  <option value="suspended">Suspended</option>
                </Select>
                <button
                  title={m.isDefault ? "Default company" : "Make default"}
                  onClick={() => !m.isDefault && run(() => sa.patch(`/api/superadmin/memberships/${m.id}`, { isDefault: true }))}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${m.isDefault ? "text-amber-500" : "text-muted-foreground hover:bg-muted"}`}
                >
                  <Star className={`h-4 w-4 ${m.isDefault ? "fill-amber-500" : ""}`} />
                </button>
                <button
                  title="Remove from company"
                  onClick={() => run(() => sa.del(`/api/superadmin/memberships/${m.id}`))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>

        {joinable.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <div className="min-w-[160px] flex-1">
              <Field label="Add to company">
                <Select value={addCompany} onChange={(e) => { setAddCompany(e.target.value); setAddRole("") }}>
                  <option value="">— Select —</option>
                  {joinable.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </Select>
              </Field>
            </div>
            <div className="w-40">
              <Field label="Role">
                <Select value={addRole} onChange={(e) => setAddRole(e.target.value)} disabled={!addCompany}>
                  <option value="">No role</option>
                  {rolesForAdd.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </Field>
            </div>
            <Button size="sm" className="gap-1" onClick={addMembership} disabled={busy || !addCompany}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        )}
      </div>
      <ErrorNote message={error} />
    </Modal>
  )
}
