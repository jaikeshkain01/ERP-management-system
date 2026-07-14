"use client"

import * as React from "react"
import { LayoutDashboard } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { MODULES } from "@/lib/modules"
import { sa, ErrorNote, StatTile, type Overview } from "@/components/superadmin/shared"

export function ModulesPanel({ data, reload }: { data: Overview; reload: () => Promise<void> }) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const toggle = async (companyId: string, moduleId: string, enabled: boolean) => {
    setBusy(`${companyId}:${moduleId}`); setError(null)
    try {
      await sa.put(`/api/superadmin/companies/${companyId}/modules`, { id: moduleId, enabled })
      await reload()
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to update module") }
    finally { setBusy(null) }
  }

  const totalEnabled = data.companies.reduce((n, c) => n + Object.values(c.modules).filter(Boolean).length, 0)
  const totalPossible = data.companies.length * MODULES.length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Companies" value={data.companies.length} tone="primary" />
        <StatTile label="Paid modules" value={MODULES.length} />
        <StatTile label="Licenses active" value={`${totalEnabled}/${totalPossible}`} />
      </div>

      <ErrorNote message={error} />

      <div className="space-y-4">
        {data.companies.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{c.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {Object.values(c.modules).filter(Boolean).length}/{MODULES.length} enabled
              </span>
            </div>
            <div className="divide-y divide-border">
              {/* Base tier — always included */}
              <div className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Base Platform</p>
                  <p className="text-xs text-muted-foreground">Dashboard, master data and settings.</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  Always included
                </span>
              </div>
              {MODULES.map((mod) => {
                const Icon = mod.icon
                const on = c.modules[mod.id] ?? true
                const key = `${c.id}:${mod.id}`
                return (
                  <div key={mod.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{mod.label}</p>
                      <p className="text-xs text-muted-foreground">{mod.description}</p>
                    </div>
                    <Switch checked={on} disabled={busy === key} onCheckedChange={(v) => toggle(c.id, mod.id, v)} />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
