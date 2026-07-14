"use client"

import * as React from "react"
import { Building2, Plus, Pencil, Users, Shield, Blocks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  sa, Modal, Field, ErrorNote, StatTile,
  type Overview, type CompanyRow,
} from "@/components/superadmin/shared"

export function CompaniesPanel({ data, reload }: { data: Overview; reload: () => Promise<void> }) {
  const [creating, setCreating] = React.useState(false)
  const [editing, setEditing] = React.useState<CompanyRow | null>(null)

  const totalMembers = data.companies.reduce((n, c) => n + c.memberCount, 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Companies" value={data.companies.length} tone="primary" />
        <StatTile label="Total members" value={totalMembers} />
        <StatTile label="Total roles" value={data.roles.length} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Tenant companies</p>
        <Button size="sm" className="gap-1.5 font-semibold" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New Company
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.companies.map((c) => {
          const enabled = Object.values(c.modules).filter(Boolean).length
          return (
            <div key={c.id} className="group rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <button
                  onClick={() => setEditing(c)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                  aria-label="Edit company"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-3 text-sm font-bold text-foreground">{c.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.memberCount}</span>
                <span className="inline-flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> {c.roleCount}</span>
                <span className="inline-flex items-center gap-1"><Blocks className="h-3.5 w-3.5" /> {enabled}/{data.moduleIds.length}</span>
              </div>
            </div>
          )
        })}
      </div>

      {creating && <CompanyModal data={data} reload={reload} onClose={() => setCreating(false)} />}
      {editing && <CompanyModal data={data} reload={reload} company={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function CompanyModal({ company, reload, onClose }: { data: Overview; company?: CompanyRow; reload: () => Promise<void>; onClose: () => void }) {
  const editing = !!company
  const [code, setCode] = React.useState(company?.code ?? "")
  const [name, setName] = React.useState(company?.name ?? "")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const submit = async () => {
    if (!code.trim() || !name.trim()) return setError("Code and name are required.")
    setSaving(true); setError(null)
    try {
      if (editing) await sa.patch(`/api/superadmin/companies/${company!.id}`, { code: code.trim(), name: name.trim() })
      else await sa.post("/api/superadmin/companies", { code: code.trim(), name: name.trim() })
      await reload()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save company")
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? `Edit ${company!.name}` : "New Company"}
      description={editing ? "Rename or re-code this tenant." : "Creates the tenant plus a default Admin role with full permissions."}
      icon={Building2}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Create Company"}</Button>
        </>
      }
    >
      <Field label="Company Code" hint="Short handle, e.g. STACKIOT or ACME.">
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ACME" className="font-mono" />
      </Field>
      <Field label="Company Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Manufacturing Pvt. Ltd." />
      </Field>
      <ErrorNote message={error} />
    </Modal>
  )
}
